/* ===== 数字分身：GLM-4.7-Flash 驱动（本地规则兜底） ===== */
const chatBody = document.getElementById('chatBody');
const chatInput = document.getElementById('chatInput');
const sendBtn = document.getElementById('sendBtn');
const charCount = document.getElementById('charCount');
const chatCounter = charCount.closest('.chat-counter');

/* ---- 字数统计：最多 250 字，实时显示「当前字数 / 250」 ---- */
const MAX_LEN = 250;
const NEAR_LIMIT = 230;

function refreshCount() {
    const len = chatInput.value.length;
    charCount.textContent = len;
    chatCounter.classList.toggle('near', len >= NEAR_LIMIT);
}

chatInput.addEventListener('input', refreshCount);
refreshCount();

/*
 * 分身人设不在这里维护——统一由后端 persona.md（数字分身说明书）注入，
 * 前端无法篡改，也无需在每次请求中携带。这里只保存多轮 user/assistant 对话。
 */
const conversation = [];

/* ---- 本地规则兜底（无 API Key 或网络失败时使用） ---- */
const KNOWLEDGE = [
    {
        keys: ['在做什么', '最近', '干嘛', '忙什么', '现在做'],
        answer:
            '最近主要在两件事：\n1. 搭建我的个人主页（你正在看的这个）；\n2. 整理自己的作品和写作方向。\n目标很朴素：把积累的东西整理清楚，方便别人快速了解我。'
    },
    {
        keys: ['作品', '作品集', '写过', '文章', '项目', '案例'],
        answer:
            '作品集正在整理中，会围绕我关心的三个方向：\n· 内容表达\n· AI 应用\n· 知识整理\n等整理好会第一时间放在这个主页上，欢迎之后再来看看。'
    },
    {
        keys: ['联系', '找你', '合作', '邮箱', '微信', 'email'],
        answer:
            '欢迎交流！可以通过邮箱联系我：\nhello@lixrea.com\n也欢迎聊聊 AI 应用、内容策划或合作机会。'
    },
    {
        keys: ['你是谁', '介绍', '名字', 'lixrea', '什么人'],
        answer:
            '我是 Lixrea 的数字分身。\nTA 是一个正在学习用 AI 做产品的内容策划，喜欢把复杂问题讲成人话。我的回答都基于 TA 公开的信息。'
    },
    {
        keys: ['兴趣', '爱好', '喜欢', '喜欢什么'],
        answer: '我关心 AI 应用、写作和旅行——一半时间研究新东西，一半时间把它们写清楚。'
    },
    {
        keys: ['擅长', '优势', '能力', '方向', '技能'],
        answer: '我擅长的是内容表达和知识整理，最近在叠加 AI 应用的新技能。简单说：把复杂的事讲成人话。'
    }
];

const FALLBACK =
    '这个问题超出了我目前掌握的范围（原型阶段我只会基于页面上公开的信息回答）。\n你可以试试问我：\n· 你现在在做什么？\n· 你有哪些作品？\n· 怎么联系你？';

function localReply(question) {
    const q = question.toLowerCase();
    const hit = KNOWLEDGE.find(item => item.keys.some(k => q.includes(k)));
    return hit ? hit.answer : FALLBACK;
}

/* ---- 消息渲染 ---- */
function addMsg(text, role) {
    const div = document.createElement('div');
    div.className = 'msg ' + role;
    div.textContent = text;
    chatBody.appendChild(div);
    chatBody.scrollTop = chatBody.scrollHeight;
    return div;
}

/* ---- 调用服务端代理，由服务端转发给 GLM-4.7-Flash ---- */
async function replyLLM(question) {
    const typing = showTyping();
    conversation.push({ role: 'user', content: question });
    try {
        const resp = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages: conversation })
        });
        const data = await resp.json();

        // 服务端未配置 Key：无缝降级到本地规则
        if (data.mode === 'local') {
            conversation.pop(); // 本地兜底不保留 LLM 上下文，避免污染
            finishTyping(typing, localReply(question));
            return;
        }
        if (!resp.ok || !data.reply) throw new Error(data.message || '请求失败');

        conversation.push({ role: 'assistant', content: data.reply });
        finishTyping(typing, data.reply);
    } catch (err) {
        // 网络异常 / 模型服务不可用：同样降级，保证页面永远能答
        conversation.pop();
        finishTyping(typing, localReply(question) + '\n（⚠️ 模型服务连接失败，以上是本地资料的回答）');
    }
}

function showTyping() {
    const typing = addMsg('', 'bot typing');
    typing.innerHTML = '<i></i><i></i><i></i>';
    return typing;
}

function finishTyping(typing, text) {
    typing.className = 'msg bot';
    typing.textContent = text;
    chatBody.scrollTop = chatBody.scrollHeight;
}

/* ---- 输入处理 ---- */
let sending = false;

function send() {
    const text = chatInput.value.trim().slice(0, MAX_LEN);
    if (!text || sending) return;
    sending = true;
    sendBtn.disabled = true;
    addMsg(text, 'user');
    chatInput.value = '';
    refreshCount();
    replyLLM(text).finally(() => {
        sending = false;
        sendBtn.disabled = false;
        chatInput.focus();
    });
}

sendBtn.addEventListener('click', send);
chatInput.addEventListener('keydown', e => { if (e.key === 'Enter') send(); });
document.querySelectorAll('.suggest button').forEach(btn =>
    btn.addEventListener('click', () => {
        chatInput.value = btn.dataset.q;
        send();
    })
);

// 开场白
addMsg('你好，我是 Lixrea 的数字分身 👋\n可以问我 TA 最近在做什么、有哪些作品，或者怎么联系。', 'bot');
