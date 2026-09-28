// EdgeOne Pages Edge Function：POST /api/chat
// 线上代理，与本地 server.py 的 /api/chat 行为保持一致：
//   1. 剥离前端传入的 system 消息（人设不可伪造）
//   2. 注入 persona.md 作为 system prompt
//   3. 附带服务端持有的 Token 转发给 ModelScope
// Token 从 EdgeOne 控制台配置的环境变量 MODELSCOPE_API_TOKEN 读取，不经过 Git 仓库。
// 文件路径 edge-functions/api/chat.js 会自动生成路由 /api/chat。

const LLM_ENDPOINT = 'https://api-inference.modelscope.cn/v1/chat/completions';
const MODEL = 'deepseek-ai/DeepSeek-V4.1-Flash';

const FALLBACK_PERSONA =
    '你是 Lixrea 的数字分身，用第一人称、简洁真诚地回答关于 Lixrea 的问题；' +
    '不知道就明确说不知道，并建议访客发邮件到 hello@lixrea.com。';

function jsonResponse(status, obj) {
    return new Response(JSON.stringify(obj), {
        status,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
}

// 只处理 POST；GET 等其他方法访问时给出 405，避免误命中
export function onRequestGet() {
    return jsonResponse(405, { error: 'method_not_allowed', message: '请使用 POST' });
}

export async function onRequestPost(context) {
    const { request, env } = context;
    const token = (env.MODELSCOPE_API_TOKEN || '').trim();

    // 1) 读取并校验前端请求
    let payload;
    try {
        payload = await request.json();
    } catch {
        return jsonResponse(400, { error: 'bad_request', message: '请求体不是合法 JSON' });
    }

    const messages = payload && payload.messages;
    if (!Array.isArray(messages) || messages.length === 0) {
        return jsonResponse(400, { error: 'bad_request', message: 'messages 不能为空' });
    }

    // 安全：忽略前端传入的任何 system 消息，人设只以服务端 persona.md 为准
    const history = messages.filter(m => m && m.role !== 'system');
    if (history.length === 0) {
        return jsonResponse(400, { error: 'bad_request', message: '没有有效的对话内容' });
    }

    // 2) 未配置 Token：明确告知前端走本地规则兜底
    if (!token) {
        return jsonResponse(200, { mode: 'local' });
    }

    // 3) 读取 persona.md（它作为静态资源托管在同源站点上，保持单一事实来源）
    let persona = FALLBACK_PERSONA;
    try {
        const personaResp = await fetch(new URL('/persona.md', request.url));
        if (personaResp.ok) {
            const text = (await personaResp.text()).trim();
            if (text) persona = text;
        }
    } catch {
        // 读取失败时使用内置兜底人设，不影响对话
    }

    // 4) 转发到 ModelScope（OpenAI 兼容协议）
    try {
        const llmResp = await fetch(LLM_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: 'Bearer ' + token,
            },
            body: JSON.stringify({
                model: MODEL,
                messages: [{ role: 'system', content: persona }, ...history],
                temperature: 0.7,
            }),
        });

        if (!llmResp.ok) {
            return jsonResponse(502, { error: 'upstream_error', message: '模型服务暂时不可用' });
        }

        const data = await llmResp.json();
        const reply = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
        if (!reply) {
            return jsonResponse(502, { error: 'upstream_error', message: '模型返回格式异常' });
        }

        return jsonResponse(200, { mode: 'llm', reply });
    } catch {
        return jsonResponse(502, { error: 'network_error', message: '网络异常，请稍后再试' });
    }
}
