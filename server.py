# -*- coding: utf-8 -*-
"""
Lixrea 个人主页 · 一体化服务器（零第三方依赖，Python 3.8+）

职责：
1. 提供静态文件（index.html / css / js）
2. 提供 POST /api/chat —— 转发请求到魔搭社区 ModelScope 上的
   deepseek-ai/DeepSeek-V4.1-Flash，API Token 只在服务端持有

API Token 读取优先级（优先级从高到低）：
1. 环境变量 MODELSCOPE_API_TOKEN
2. 项目根目录 .env 文件中的 MODELSCOPE_API_TOKEN=xxx
（前端永远接触不到 Token）

启动：python server.py        （默认端口 8000，可用 PORT 环境变量修改）
"""

import json
import os
import urllib.request
import urllib.error
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

# 目录切换到本文件所在目录，保证从任意位置启动都能找到静态资源
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
os.chdir(BASE_DIR)

PORT = int(os.environ.get("PORT", "8000"))

# 魔搭社区 ModelScope Inference（OpenAI 兼容协议）
LLM_ENDPOINT = "https://api-inference.modelscope.cn/v1/chat/completions"
MODEL = "deepseek-ai/DeepSeek-V4.1-Flash"

# 数字分身说明书（system prompt）。独立文件，改完无需重启（按 mtime 热加载）
PERSONA_PATH = os.path.join(BASE_DIR, "persona.md")
_FALLBACK_PERSONA = (
    "你是 Lixrea 的数字分身，用第一人称、简洁真诚地回答关于 Lixrea 的问题；"
    "不知道就明确说不知道，并建议访客发邮件到 hello@lixrea.com。"
)
_persona_cache = {"text": None, "mtime": None}


def load_persona():
    """读取 persona.md；检测到文件修改时间变化就重新加载，实现免重启热更新。"""
    try:
        mtime = os.path.getmtime(PERSONA_PATH)
    except OSError:
        return _FALLBACK_PERSONA
    if _persona_cache["text"] is None or _persona_cache["mtime"] != mtime:
        try:
            with open(PERSONA_PATH, "r", encoding="utf-8") as f:
                _persona_cache["text"] = f.read().strip()
            _persona_cache["mtime"] = mtime
            print("[Persona] 已重新加载说明书 persona.md")
        except OSError:
            return _FALLBACK_PERSONA
    return _persona_cache["text"]


def load_dotenv():
    """极简 .env 解析：只识别 KEY=VALUE，不覆盖已存在的环境变量。无需第三方库。"""
    env_path = os.path.join(BASE_DIR, ".env")
    if not os.path.exists(env_path):
        return
    with open(env_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            # 环境变量优先：已设置的不被 .env 覆盖
            os.environ.setdefault(key, value)


load_dotenv()
API_TOKEN = os.environ.get("MODELSCOPE_API_TOKEN", "").strip()


class Handler(SimpleHTTPRequestHandler):
    """静态文件服务 + /api/chat 代理，同端口同源，无 CORS 问题。"""

    def do_POST(self):
        if self.path.split("?")[0] != "/api/chat":
            self.send_json(404, {"error": "not_found", "message": "接口不存在"})
            return

        # 1) 读取并校验前端请求
        try:
            length = int(self.headers.get("Content-Length", 0))
            payload = json.loads(self.rfile.read(length) or b"{}")
            messages = payload.get("messages")
            if not isinstance(messages, list) or not messages:
                self.send_json(400, {"error": "bad_request", "message": "messages 不能为空"})
                return
        except (ValueError, json.JSONDecodeError):
            self.send_json(400, {"error": "bad_request", "message": "请求体不是合法 JSON"})
            return

        # 安全：忽略前端传入的任何 system 消息，人设只以服务端 persona.md 为准（防伪造）
        history = [m for m in messages if m.get("role") != "system"]
        if not history:
            self.send_json(400, {"error": "bad_request", "message": "没有有效的对话内容"})
            return

        # 2) 未配置 Token：明确告知前端走本地兜底
        if not API_TOKEN:
            self.send_json(200, {"mode": "local"})
            return

        # 3) 转发到 ModelScope（服务端注入说明书、model 与鉴权头，前端无法伪造）
        final_messages = [{"role": "system", "content": load_persona()}] + history
        body = json.dumps({
            "model": MODEL,
            "messages": final_messages,
            "temperature": 0.7,
        }).encode("utf-8")

        req = urllib.request.Request(
            LLM_ENDPOINT,
            data=body,
            headers={
                "Content-Type": "application/json",
                "Authorization": "Bearer " + API_TOKEN,
            },
            method="POST",
        )

        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            reply_text = data["choices"][0]["message"]["content"]
            self.send_json(200, {"mode": "llm", "reply": reply_text})
        except urllib.error.HTTPError as e:
            detail = e.read().decode("utf-8", errors="replace")[:300]
            print("[LLM] 上游 HTTP 错误:", e.code, detail)
            self.send_json(502, {"error": "upstream_error", "message": "模型服务暂时不可用"})
        except Exception as e:  # 超时 / 网络异常
            print("[LLM] 请求异常:", repr(e))
            self.send_json(502, {"error": "network_error", "message": "网络异常，请稍后再试"})

    def send_json(self, code, obj):
        data = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, fmt, *args):
        # 精简日志：只记录方法/路径/状态码
        print("%s - %s" % (self.command, self.path))


if __name__ == "__main__":
    token_status = "已配置 (.env 或环境变量)" if API_TOKEN else "未配置（数字分身将使用本地规则模式）"
    print("=" * 56)
    print("  Lixrea 个人主页服务已启动")
    print("  预览地址: http://127.0.0.1:%d/" % PORT)
    print("  模型: %s (ModelScope)" % MODEL)
    print("  API Token 状态: %s" % token_status)
    print("=" * 56)
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
