# Lixrea 个人主页 · 数字分身

一个带「数字分身」聊天区的个人主页：访客可以了解我、查看作品与联系方式，也可以直接和我的数字分身对话。

- **关于我 / 作品展示 / 联系方式**：卡片式信息展示，点击卡片可放大查看，背景毛玻璃模糊
- **数字分身聊天**：由魔搭社区 ModelScope 上的 `deepseek-ai/DeepSeek-V4.1-Flash` 驱动，分身人设由 [persona.md](persona.md) 统一约束
- **零第三方依赖**：前端为原生 HTML / CSS / JS，服务端仅使用 Python 3.8+ 标准库
- **本地规则兜底**：未配置 API Token 或模型不可用时，自动降级为内置规则回答，页面永远能答

## 快速开始

需要 Python 3.8 或更高版本（无需 pip install）。

```bash
python server.py
```

启动后访问 http://127.0.0.1:8000/ 即可。

默认端口为 `8000`，可用环境变量修改：

```bash
# Windows PowerShell
$env:PORT=9000; python server.py
```

## 配置数字分身的 API Token（可选但推荐）

不配置 Token 时网站完全可用，数字分身会运行在**本地规则模式**（只能回答内置的几个问题）。配置后才会接入真正的大模型。

1. 在魔搭社区获取 Access Token：https://modelscope.cn/my/myaccesstoken
2. 复制 [.env.example](.env.example) 为 `.env`，填入 Token：

   ```
   MODELSCOPE_API_TOKEN=你的Token
   ```

3. 重启 `server.py`

Token 只在服务端读取并用于转发请求，前端代码和浏览器永远接触不到它；`.env` 已在 [.gitignore](.gitignore) 中，不会进入版本库。

## 部署到 EdgeOne Pages

线上部署不需要运行 `server.py`——EdgeOne Pages 是静态托管 + Serverless 平台，仓库中的 [edge-functions/api/chat.js](edge-functions/api/chat.js) 会被自动部署为边缘函数，生成线上路由 `POST /api/chat`，替代本地 Python 代理。

**部署步骤：**

1. 将仓库推送到 GitHub，并在 EdgeOne Pages 中通过「导入 GitHub 仓库」创建项目（无需构建配置，无需输出目录）
2. 在 Pages 项目的 **「设置」→「环境变量」** 中新增：
   - 变量名：`MODELSCOPE_API_TOKEN`（必须完全一致）
   - 变量值：与本地 `.env` 中相同的 ModelScope Token
   - 变量类型：建议选 **Secret**（保存后不可见）
   - 生效环境：生产环境（Production）
3. 保存后若提示重新部署，点一次「重新部署」

**验证：** 打开线上网站问数字分身一个问题，浏览器 F12 → Network 中查看 `/api/chat` 响应：

- `{"mode":"llm","reply":"..."}` —— 已接入大模型 ✓
- `{"mode":"local"}` —— 环境变量未生效，检查变量名拼写与生效环境后重新部署
- `404` —— 边缘函数未部署，确认仓库中存在 `edge-functions/api/chat.js`

> **注意**：Token 只配置在 EdgeOne 控制台，`.env` 永远不要提交到 GitHub。线上修改分身人设只需编辑 `persona.md` 后 push（它作为静态资源被边缘函数读取）。更换线上模型时，需同步修改 [edge-functions/api/chat.js](edge-functions/api/chat.js) 顶部的 `LLM_ENDPOINT` / `MODEL` 常量。

## 项目结构

```
digital-twin/
├── index.html          # 唯一页面入口（关于我 / 作品 / 联系方式 / 数字分身）
├── server.py           # 一体化服务器：静态文件 + POST /api/chat 模型代理（本地开发用）
├── edge-functions/
│   └── api/chat.js     # EdgeOne Pages 边缘函数：线上 /api/chat 代理（部署用）
├── persona.md          # 数字分身说明书（system prompt），修改后自动热加载
├── .env.example        # API Token 配置模板（复制为 .env 使用）
├── css/                # 按页面区域拆分的样式
│   ├── base.css        #   设计变量与基础样式
│   ├── nav.css         #   顶部导航
│   ├── hero.css        #   首屏
│   ├── about.css       #   关于我卡片
│   ├── works.css       #   作品展示卡片
│   ├── contact.css     #   联系方式
│   ├── chat.css        #   聊天区
│   ├── modal.css       #   卡片点击放大弹层
│   ├── tabs.css        #   模块切换
│   ├── footer.css      #   页脚
│   └── responsive.css  #   移动端响应式
└── js/                 # 按功能拆分的脚本
    ├── tabs.js         #   「关于我 / 数字分身」模块切换
    ├── chat.js         #   聊天交互、字数限制、服务端对话接口调用
    └── card-modal.js   #   卡片放大弹层（ESC / × / 点击空白关闭）
```

资源加载顺序在 `index.html` 中按「基础 → 区域 → 响应式」组织 CSS，按功能顺序加载 JS。

## 数字分身工作原理

```
浏览器（js/chat.js）
      │  POST /api/chat { messages: [...] }
      ▼
server.py（同端口代理）
      │  · 剥离前端传入的 system 消息（人设不可被伪造）
      │  · 注入 persona.md 作为 system prompt
      │  · 附带服务端持有的 Token
      ▼
ModelScope Inference（OpenAI 兼容协议）
      → deepseek-ai/DeepSeek-V4.1-Flash
```

上图是本地开发的链路；线上部署时，「server.py 代理」这一层由 EdgeOne 边缘函数 [edge-functions/api/chat.js](edge-functions/api/chat.js) 承担，安全逻辑完全一致。

- **修改分身人设**：直接编辑 [persona.md](persona.md)，服务端按文件修改时间热加载，无需重启。
- **输入限制**：聊天输入框最多 250 字，实时显示「当前字数 / 250」，接近上限时提示变色。

## 更换大模型

模型接入点集中在 [server.py](server.py) 顶部两个常量：

```python
LLM_ENDPOINT = "https://api-inference.modelscope.cn/v1/chat/completions"
MODEL = "deepseek-ai/DeepSeek-V4.1-Flash"
```

更换步骤：

1. 将 `LLM_ENDPOINT` 改为目标服务的 OpenAI 兼容接口地址
2. 将 `MODEL` 改为目标模型 ID
3. 如目标服务使用不同的 Token，在 `.env` 中新增对应环境变量，并修改服务端读取的变量名与鉴权头
4. 重启 `server.py`

只要目标平台兼容 OpenAI 的 `chat/completions` 协议，前端无需任何改动。若项目已部署到 EdgeOne Pages，记得同步修改边缘函数 [edge-functions/api/chat.js](edge-functions/api/chat.js) 顶部的同名常量。
