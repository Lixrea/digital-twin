/* ===== 卡片放大弹层：点击「关于我 / 作品展示」卡片放大展示，背景毛玻璃模糊 ===== */
(function () {
    const aboutPanel = document.getElementById('about');
    if (!aboutPanel) return;

    const CARD_SELECTOR = '.cards .card, .works .work-card';

    // 让卡片支持键盘操作（Enter / Space 打开）
    aboutPanel.querySelectorAll(CARD_SELECTOR).forEach(card => {
        card.setAttribute('tabindex', '0');
        card.setAttribute('role', 'button');
    });

    let overlay = null;
    let animating = false;

    function openCard(card) {
        if (overlay || animating) return;
        animating = true;

        overlay = document.createElement('div');
        overlay.className = 'card-overlay';

        // 克隆原卡片：保留 .card / .work-card 的全部原有样式，仅追加弹层修饰类
        const clone = card.cloneNode(true);
        clone.classList.add('modal-card');
        clone.removeAttribute('tabindex');
        clone.removeAttribute('role');

        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'modal-close';
        closeBtn.setAttribute('aria-label', '关闭');
        closeBtn.innerHTML = '&times;';
        clone.appendChild(closeBtn);

        overlay.appendChild(clone);
        document.body.appendChild(overlay);
        document.body.classList.add('modal-open'); // 锁定背景滚动

        // 双 rAF 确保先完成首帧渲染，再触发过渡动画
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                overlay.classList.add('show');
                closeBtn.focus();
                animating = false;
            });
        });
    }

    function closeCard() {
        if (!overlay || animating) return;
        const el = overlay;
        overlay = null;
        el.classList.remove('show');
        document.body.classList.remove('modal-open');

        const done = () => el.isConnected && el.remove();
        el.addEventListener('transitionend', function handler(e) {
            if (e.target !== el || e.propertyName !== 'opacity') return;
            el.removeEventListener('transitionend', handler);
            done();
        });
        setTimeout(done, 400); // 兜底：transitionend 未触发时也能清理
    }

    // 事件委托：点击卡片打开
    aboutPanel.addEventListener('click', e => {
        const card = e.target.closest(CARD_SELECTOR);
        if (card) openCard(card);
    });

    // 键盘：卡片上按 Enter / Space 打开
    aboutPanel.addEventListener('keydown', e => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const card = e.target.closest(CARD_SELECTOR);
        if (!card) return;
        e.preventDefault();
        openCard(card);
    });

    // 点击蒙层空白处或弹层内关闭按钮：关闭
    // （仅认定弹层内的事件，避免与"点击卡片打开"的同一次冒泡冲突）
    document.addEventListener('click', e => {
        if (!overlay || !overlay.contains(e.target)) return;
        if (e.target === overlay || e.target.closest('.modal-close')) closeCard();
    });

    // ESC 关闭
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') closeCard();
    });
})();
