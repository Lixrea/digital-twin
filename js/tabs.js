/* ===== 模块切换：关于我 / 数字分身（所有 data-tab 元素通用） ===== */
const tabTriggers = document.querySelectorAll('[data-tab]');
const tabPanels = {
    about: document.getElementById('about'),
    twin: document.getElementById('twin')
};

function switchTab(name) {
    // 按钮高亮跟随当前界面
    tabTriggers.forEach(el => el.classList.toggle('active', el.dataset.tab === name));
    Object.entries(tabPanels).forEach(([key, el]) =>
        el.classList.toggle('active', key === name)
    );
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

tabTriggers.forEach(el =>
    el.addEventListener('click', () => switchTab(el.dataset.tab))
);
