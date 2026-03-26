// antibot.js - защита от ботов-накрутчиков поведенческих метрик
(function(){
    // ========== НАСТРОЙКИ (измените под свои нужды) ==========
    const CONFIG = {
        OBSERVATION_TIME_MS: 15000,          // время наблюдения за поведением (мс)
        SUSPICIOUS_SCORE_THRESHOLD: 2,       // порог подозрительности (чем ниже, тем чаще капча)
        COOKIE_NAME: 'human_verified',
        COOKIE_DAYS: 30,
        mouseLinearityThreshold: 0.98,       // линейность траектории выше -> подозрение
        jumpThreshold: 150,                 // пикселей для определения "прыжка" мыши
        minClickDuration: 30,               // минимальная длительность клика (мс)
        CAPTCHA_WIDTH: 450,                 // ширина области капчи
        CAPTCHA_HEIGHT: 250,                // высота области капчи
        PUZZLE_SIZE: 70,                   // размер пазла
        TOLERANCE: 12                      // допустимое отклонение для совмещения (пикс)
    };

    // ========== МЕСТО ДЛЯ ВСТАВКИ КОДА МЕТРИКИ ==========
    // Замените содержимое этой функции на код вашей системы аналитики
    function loadMetrics() {
        console.log('✅ Поведенческая метрика загружена (замените на свой код)');
        // ===== ВСТАВЬТЕ СВОЙ КОД МЕТРИКИ ЗДЕСЬ =====
        // Пример для Яндекс.Метрики:
        // (function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};...})();
        // Пример для Google Analytics:
        // window.dataLayer = window.dataLayer || []; function gtag(){dataLayer.push(arguments);} gtag('js', new Date()); gtag('config', 'UA-XXXXX-Y');
        // ============================================
    }

    // ========== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ==========
    function setCookie(name, value, days) {
        let expires = '';
        if (days) {
            const date = new Date();
            date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);
            expires = '; expires=' + date.toUTCString();
        }
        document.cookie = name + '=' + (value || '') + expires + '; path=/; SameSite=Lax';
    }

    function getCookie(name) {
        const nameEQ = name + '=';
        const ca = document.cookie.split(';');
        for (let c of ca) {
            while (c.charAt(0) === ' ') c = c.substring(1);
            if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
        }
        return null;
    }

    // ========== ПОВЕДЕНЧЕСКИЙ АНАЛИЗ ==========
    class BehaviorCollector {
        constructor() {
            this.mouseMovements = [];
            this.clicks = [];
            this.keyPresses = 0;
            this.scrolls = 0;
            this.touches = 0;
            this.clickStartTime = null;
            this.mouseDownHandler = this.onMouseDown.bind(this);
            this.mouseUpHandler = this.onMouseUp.bind(this);
            this.mouseMoveHandler = this.onMouseMove.bind(this);
            this.clickHandler = this.onClick.bind(this);
            this.keyDownHandler = this.onKeyDown.bind(this);
            this.scrollHandler = this.onScroll.bind(this);
            this.touchMoveHandler = this.onTouchMove.bind(this);
        }

        start() {
            window.addEventListener('mousemove', this.mouseMoveHandler);
            window.addEventListener('click', this.clickHandler);
            window.addEventListener('keydown', this.keyDownHandler);
            window.addEventListener('scroll', this.scrollHandler);
            window.addEventListener('touchmove', this.touchMoveHandler);
            window.addEventListener('mousedown', this.mouseDownHandler);
            window.addEventListener('mouseup', this.mouseUpHandler);
        }

        stop() {
            window.removeEventListener('mousemove', this.mouseMoveHandler);
            window.removeEventListener('click', this.clickHandler);
            window.removeEventListener('keydown', this.keyDownHandler);
            window.removeEventListener('scroll', this.scrollHandler);
            window.removeEventListener('touchmove', this.touchMoveHandler);
            window.removeEventListener('mousedown', this.mouseDownHandler);
            window.removeEventListener('mouseup', this.mouseUpHandler);
        }

        onMouseMove(e) {
            this.mouseMovements.push({ x: e.clientX, y: e.clientY, timestamp: Date.now() });
            if (this.mouseMovements.length > 500) this.mouseMovements.shift();
        }

        onMouseDown(e) { this.clickStartTime = Date.now(); }
        onMouseUp(e) {
            if (this.clickStartTime && this.clicks.length > 0) {
                this.clicks[this.clicks.length-1].duration = Date.now() - this.clickStartTime;
                this.clickStartTime = null;
            }
        }
        onClick(e) {
            this.clicks.push({ timestamp: Date.now(), duration: null, x: e.clientX, y: e.clientY });
            if (this.clicks.length > 50) this.clicks.shift();
        }
        onKeyDown() { this.keyPresses++; }
        onScroll() { this.scrolls++; }
        onTouchMove(e) {
            this.touches++;
            if (e.touches.length) {
                const t = e.touches[0];
                this.mouseMovements.push({ x: t.clientX, y: t.clientY, timestamp: Date.now() });
            }
        }

        analyze() {
            let score = 0;

            if (this.mouseMovements.length === 0 && (this.clicks.length > 0 || this.keyPresses > 0)) {
                score += 3;
            }
            const totalInteractions = this.mouseMovements.length + this.clicks.length + this.keyPresses + this.scrolls + this.touches;
            if (totalInteractions === 0) {
                score += 2;
            }

            if (this.mouseMovements.length >= 5) {
                let totalDist = 0;
                const first = this.mouseMovements[0];
                const last = this.mouseMovements[this.mouseMovements.length-1];
                const straightDist = Math.hypot(last.x - first.x, last.y - first.y);
                for (let i=1; i<this.mouseMovements.length; i++) {
                    const p1 = this.mouseMovements[i-1];
                    const p2 = this.mouseMovements[i];
                    totalDist += Math.hypot(p2.x - p1.x, p2.y - p1.y);
                }
                const linearity = straightDist / (totalDist + 0.001);
                if (linearity > CONFIG.mouseLinearityThreshold) {
                    score += 2;
                }

                const timeSpan = last.timestamp - first.timestamp;
                if (timeSpan > 0) {
                    const avgSpeed = totalDist / (timeSpan / 1000);
                    if (avgSpeed > 2000) {
                        score += 1;
                    }
                }

                let jumps = 0;
                for (let i=1; i<this.mouseMovements.length; i++) {
                    const dist = Math.hypot(this.mouseMovements[i].x - this.mouseMovements[i-1].x,
                                            this.mouseMovements[i].y - this.mouseMovements[i-1].y);
                    if (dist > CONFIG.jumpThreshold) jumps++;
                }
                if (jumps > 2) {
                    score += 1;
                }
            }

            let shortClicks = 0;
            for (let c of this.clicks) {
                if (c.duration !== null && c.duration < CONFIG.minClickDuration) shortClicks++;
            }
            if (shortClicks > 0) {
                score += Math.min(2, shortClicks);
            }

            if ('ontouchstart' in window && this.touches === 0 && (this.clicks.length > 0 || this.scrolls > 0)) {
                score += 1;
            }

            return score;
        }
    }

    function detectEnvironmentAnomalies() {
        let score = 0;
        if (navigator.webdriver === true) score += 2;
        if (navigator.plugins.length === 0) score += 1;
        if (typeof window.chrome === 'undefined') score += 1;
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl');
        if (gl) {
            const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
            if (debugInfo) {
                const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
                if (renderer && (renderer.includes('SwiftShader') || renderer.includes('llvmpipe'))) {
                    score += 1;
                }
            }
        }
        return score;
    }

    // ========== КАПЧА (ДВУХОСЕВОЙ ПАЗЛ) ==========
    class DragCaptcha {
        constructor(onSuccess) {
            this.onSuccess = onSuccess;
            this.overlay = null;
            this.bgCanvas = null;
            this.ctxBg = null;
            this.puzzleElement = null;
            this.puzzleImage = null;
            this.targetX = 0;
            this.targetY = 0;
            this.isDragging = false;
            this.startMouse = { x: 0, y: 0 };
            this.startPuzzlePos = { x: 0, y: 0 };
            this.currentPuzzlePos = { x: 0, y: 0 };
            this.maxX = 0;
            this.maxY = 0;
            this.verified = false;
        }

        generateBackground() {
            const w = CONFIG.CAPTCHA_WIDTH;
            const h = CONFIG.CAPTCHA_HEIGHT;
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');

            const grad = ctx.createLinearGradient(0, 0, w, h);
            grad.addColorStop(0, '#e9f0fc');
            grad.addColorStop(1, '#d4e0f5');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, w, h);

            ctx.save();
            ctx.globalAlpha = 0.5;
            for (let i = 0; i < 40; i++) {
                ctx.fillStyle = `hsl(${Math.random() * 360}, 70%, 65%)`;
                ctx.beginPath();
                ctx.arc(Math.random() * w, Math.random() * h, Math.random() * 10 + 3, 0, Math.PI*2);
                ctx.fill();
            }
            ctx.restore();

            ctx.beginPath();
            ctx.strokeStyle = '#aaa';
            ctx.lineWidth = 1;
            for (let i = 0; i < 30; i++) {
                ctx.moveTo(Math.random() * w, Math.random() * h);
                ctx.lineTo(Math.random() * w, Math.random() * h);
                ctx.stroke();
            }
            return canvas;
        }

        cutPiece(sourceCanvas, x, y, size) {
            const pieceCanvas = document.createElement('canvas');
            pieceCanvas.width = size;
            pieceCanvas.height = size;
            const ctx = pieceCanvas.getContext('2d');
            ctx.drawImage(sourceCanvas, x, y, size, size, 0, 0, size, size);
            return pieceCanvas;
        }

        show() {
            if (this.verified) return;
            this.overlay = document.createElement('div');
            this.overlay.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.85); display:flex; justify-content:center; align-items:center; z-index:10000; font-family:Segoe UI,sans-serif;';
            const container = document.createElement('div');
            container.style.cssText = 'background:white; border-radius:24px; padding:20px; width:90%; max-width:550px; text-align:center;';
            container.innerHTML = `
                <h3 style="margin-top:0;">🧩 Перетащите пазл на место</h3>
                <p>Совместите фрагмент с выделенной областью</p>
                <div style="position:relative; background:#f0f0f0; border-radius:12px; padding:15px; margin:15px 0;">
                    <div style="position:relative; display:inline-block;">
                        <canvas id="antibotBgCanvas" width="${CONFIG.CAPTCHA_WIDTH}" height="${CONFIG.CAPTCHA_HEIGHT}" style="display:block; border-radius:8px; background:#ddd;"></canvas>
                        <div id="antibotPuzzlePiece" style="position:absolute; cursor:grab; touch-action:none; filter:drop-shadow(0 2px 4px rgba(0,0,0,0.3)); width:${CONFIG.PUZZLE_SIZE}px; height:${CONFIG.PUZZLE_SIZE}px;"></div>
                    </div>
                </div>
                <div id="antibotCaptchaMessage" style="margin-top:12px; font-size:14px; min-height:40px;"></div>
                <button id="antibotResetBtn" style="background:#1e3c72; color:white; border:none; padding:8px 16px; border-radius:30px; cursor:pointer; font-size:13px;">↻ Сбросить положение</button>
            `;
            this.overlay.appendChild(container);
            document.body.appendChild(this.overlay);

            this.bgCanvas = document.getElementById('antibotBgCanvas');
            this.ctxBg = this.bgCanvas.getContext('2d');
            this.puzzleElement = document.getElementById('antibotPuzzlePiece');
            const resetBtn = document.getElementById('antibotResetBtn');

            const fullBg = this.generateBackground();
            this.ctxBg.drawImage(fullBg, 0, 0);

            const maxX = CONFIG.CAPTCHA_WIDTH - CONFIG.PUZZLE_SIZE;
            const maxY = CONFIG.CAPTCHA_HEIGHT - CONFIG.PUZZLE_SIZE;
            this.targetX = Math.floor(Math.random() * (maxX - 20) + 10);
            this.targetY = Math.floor(Math.random() * (maxY - 20) + 10);

            this.ctxBg.fillStyle = '#ccccdd';
            this.ctxBg.fillRect(this.targetX, this.targetY, CONFIG.PUZZLE_SIZE, CONFIG.PUZZLE_SIZE);
            this.ctxBg.strokeStyle = '#ff4d4d';
            this.ctxBg.lineWidth = 2;
            this.ctxBg.strokeRect(this.targetX, this.targetY, CONFIG.PUZZLE_SIZE, CONFIG.PUZZLE_SIZE);

            let startX = Math.floor(Math.random() * (maxX + 1));
            let startY = Math.floor(Math.random() * (maxY + 1));
            this.puzzleImage = this.cutPiece(fullBg, startX, startY, CONFIG.PUZZLE_SIZE);
            this.currentPuzzlePos = { x: startX, y: startY };
            this.maxX = maxX;
            this.maxY = maxY;

            this.updatePuzzlePosition(startX, startY);
            this.attachDragEvents();

            resetBtn.addEventListener('click', () => {
                const newX = Math.floor(Math.random() * (this.maxX + 1));
                const newY = Math.floor(Math.random() * (this.maxY + 1));
                this.currentPuzzlePos = { x: newX, y: newY };
                this.updatePuzzlePosition(newX, newY);
                const msgDiv = document.getElementById('antibotCaptchaMessage');
                if (msgDiv) msgDiv.innerHTML = '';
            });
        }

        updatePuzzlePosition(x, y) {
            this.puzzleElement.style.left = x + 'px';
            this.puzzleElement.style.top = y + 'px';
            if (!this.puzzleElement.hasChildNodes()) {
                const imgCanvas = document.createElement('canvas');
                imgCanvas.width = CONFIG.PUZZLE_SIZE;
                imgCanvas.height = CONFIG.PUZZLE_SIZE;
                imgCanvas.style.width = '100%';
                imgCanvas.style.height = '100%';
                imgCanvas.style.borderRadius = '6px';
                this.puzzleElement.appendChild(imgCanvas);
            }
            const canvasInside = this.puzzleElement.querySelector('canvas');
            const ctxInside = canvasInside.getContext('2d');
            ctxInside.clearRect(0, 0, CONFIG.PUZZLE_SIZE, CONFIG.PUZZLE_SIZE);
            ctxInside.drawImage(this.puzzleImage, 0, 0);
        }

        attachDragEvents() {
            const element = this.puzzleElement;
            const onMove = (e) => {
                if (!this.isDragging) return;
                e.preventDefault();
                let clientX, clientY;
                if (e.touches) {
                    clientX = e.touches[0].clientX;
                    clientY = e.touches[0].clientY;
                } else {
                    clientX = e.clientX;
                    clientY = e.clientY;
                }
                const dx = clientX - this.startMouse.x;
                const dy = clientY - this.startMouse.y;
                let newX = this.startPuzzlePos.x + dx;
                let newY = this.startPuzzlePos.y + dy;
                newX = Math.min(this.maxX, Math.max(0, newX));
                newY = Math.min(this.maxY, Math.max(0, newY));
                this.currentPuzzlePos = { x: newX, y: newY };
                this.updatePuzzlePosition(newX, newY);
                this.checkMatch(newX, newY);
            };

            const onUp = () => {
                if (this.isDragging) {
                    this.isDragging = false;
                    document.removeEventListener('mousemove', onMove);
                    document.removeEventListener('mouseup', onUp);
                    document.removeEventListener('touchmove', onMove);
                    document.removeEventListener('touchend', onUp);
                }
            };

            const onDown = (e) => {
                if (this.verified) return;
                e.preventDefault();
                this.isDragging = true;
                let clientX, clientY;
                if (e.touches) {
                    clientX = e.touches[0].clientX;
                    clientY = e.touches[0].clientY;
                } else {
                    clientX = e.clientX;
                    clientY = e.clientY;
                }
                this.startMouse = { x: clientX, y: clientY };
                this.startPuzzlePos = { ...this.currentPuzzlePos };
                document.addEventListener('mousemove', onMove);
                document.addEventListener('mouseup', onUp);
                document.addEventListener('touchmove', onMove);
                document.addEventListener('touchend', onUp);
            };

            element.addEventListener('mousedown', onDown);
            element.addEventListener('touchstart', onDown);
        }

        checkMatch(x, y) {
            const diffX = Math.abs(x - this.targetX);
            const diffY = Math.abs(y - this.targetY);
            if (diffX <= CONFIG.TOLERANCE && diffY <= CONFIG.TOLERANCE && !this.verified) {
                this.verified = true;
                const msgDiv = document.getElementById('antibotCaptchaMessage');
                msgDiv.innerHTML = '✅ Пазл собран! Вы человек.';
                msgDiv.style.color = '#2e7d32';
                setTimeout(() => {
                    this.close();
                    if (this.onSuccess) this.onSuccess();
                }, 800);
            } else {
                if (!this.verified) {
                    const msgDiv = document.getElementById('antibotCaptchaMessage');
                    if (msgDiv.innerHTML !== '✅ Пазл собран! Вы человек.') {
                        msgDiv.innerHTML = 'Переместите фрагмент в выделенную область';
                        msgDiv.style.color = '';
                    }
                }
            }
        }

        close() {
            if (this.overlay) this.overlay.remove();
        }
    }

    // ========== ОСНОВНОЙ КЛАСС ЗАЩИТЫ ==========
    class BotDefender {
        constructor() {
            this.collector = new BehaviorCollector();
            this.captchaShown = false;
            this.verified = false;
            this.observationTimer = null;
        }

        start() {
            if (getCookie(CONFIG.COOKIE_NAME)) {
                this.verified = true;
                loadMetrics();
                return;
            }
            this.collector.start();
            this.observationTimer = setTimeout(() => this.finishObservation(), CONFIG.OBSERVATION_TIME_MS);
        }

        finishObservation() {
            if (this.verified) return;
            this.collector.stop();
            const behaviorScore = this.collector.analyze();
            const envScore = detectEnvironmentAnomalies();
            const totalScore = behaviorScore + envScore;

            if (totalScore >= CONFIG.SUSPICIOUS_SCORE_THRESHOLD) {
                this.showCaptcha();
            } else {
                this.verifyUser();
            }
        }

        showCaptcha() {
            if (this.captchaShown || this.verified) return;
            this.captchaShown = true;
            const captcha = new DragCaptcha(() => this.verifyUser());
            captcha.show();
        }

        verifyUser() {
            if (this.verified) return;
            this.verified = true;
            setCookie(CONFIG.COOKIE_NAME, 'true', CONFIG.COOKIE_DAYS);
            loadMetrics();
            if (this.observationTimer) clearTimeout(this.observationTimer);
        }
    }

    // Автоматический запуск после загрузки DOM
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => new BotDefender().start());
    } else {
        new BotDefender().start();
    }
})();
