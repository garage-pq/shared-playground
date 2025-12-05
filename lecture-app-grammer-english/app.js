/**
 * 共通クイズエンジン
 * どのHTMLファイルから呼ばれても、渡された config に基づいて動作する。
 */
const app = (function() {
    
    // 状態管理
    let config = null; 
    let currentLevel = 2;
    let currentMode = 'basic'; 
    let difficultyRates = { 1: 0.15, 2: 0.35, 3: 0.60 };

    // 新規追加: 表示行数の管理
    let currentRowCount = 0; 
    const STORAGE_KEY_PREFIX = 'quiz_last_rows_'; 

    // 現在表示している行インデックスを保持する変数
    let currentRowIndices = [];

    const getEl = (id) => document.getElementById(id);

    function init(userConfig) {
        config = userConfig;
        
        const titleEl = getEl('pageTitle');
        if(titleEl) titleEl.textContent = config.title;

        const modeGroup = document.querySelector('.mode-group');
        if (config.disableModeSelection && modeGroup) {
            modeGroup.style.display = 'none';
            currentMode = config.basicColCount ? 'basic' : 'full';
        }

        const rowLimitGroup = document.querySelector('.row-limit-group');
        if (config.enableRowSelection) {
            if (rowLimitGroup) rowLimitGroup.style.display = 'flex';
            currentRowCount = config.defaultRowCount || 20;
            updateRowCountUI();
        } else {
            if (rowLimitGroup) rowLimitGroup.style.display = 'none';
            currentRowCount = 0; 
        }

        // 最初は「次の問題」として開始
        resetQuiz(false);
    }

    function setDifficulty(level) {
        currentLevel = level;
        document.querySelectorAll('.level-btn').forEach((btn, index) => {
            if (index + 1 === level) btn.classList.add('active');
            else btn.classList.remove('active');
        });
        resetQuiz(true);
    }

    function changeMode() {
        const radios = document.getElementsByName('mode');
        for (const radio of radios) {
            if (radio.checked) {
                currentMode = radio.value;
                break;
            }
        }
        resetQuiz(true); 
    }

    function setRowCount(count) {
        currentRowCount = count;
        updateRowCountUI();
        resetQuiz(false); 
    }

    function updateRowCountUI() {
        document.querySelectorAll('.row-count-btn').forEach(btn => {
            const val = parseInt(btn.dataset.count, 10);
            if (val === currentRowCount) btn.classList.add('active');
            else btn.classList.remove('active');
        });
    }

    /**
     * 表示すべき行データのインデックス配列を計算する
     */
    function selectRowIndices(totalDataLength) {
        if (currentRowCount === 0 || totalDataLength <= currentRowCount) {
            return [...Array(totalDataLength).keys()];
        }

        const v = currentRowCount;
        const storageKey = STORAGE_KEY_PREFIX + (config.id || config.title); 
        
        let lastShownIndices = [];
        try {
            const saved = localStorage.getItem(storageKey);
            if (saved) lastShownIndices = JSON.parse(saved);
        } catch (e) { console.warn("Storage access limited:", e); }

        const allIndices = [...Array(totalDataLength).keys()];
        const hiddenIndices = allIndices.filter(idx => !lastShownIndices.includes(idx));
        const h = hiddenIndices.length;

        let selectedIndices = [];

        if (h === v) {
            selectedIndices = [...hiddenIndices];
        } else if (h < v) {
            selectedIndices = [...hiddenIndices];
            const needed = v - h;
            const shuffledLast = [...lastShownIndices].sort(() => 0.5 - Math.random());
            selectedIndices = selectedIndices.concat(shuffledLast.slice(0, needed));
        } else {
            const shuffledHidden = [...hiddenIndices].sort(() => 0.5 - Math.random());
            selectedIndices = shuffledHidden.slice(0, v);
        }

        try {
            localStorage.setItem(storageKey, JSON.stringify(selectedIndices));
        } catch (e) {}

        return selectedIndices.sort((a, b) => a - b);
    }

    function resetQuiz(isRetrySame = false) {
        const msgArea = getEl('messageArea');
        msgArea.style.display = 'none';
        msgArea.className = '';
        msgArea.textContent = '';
        
        // --- ボタン表示のリセット（すべて隠す） ---
        const checkBtn = getEl('checkBtn');
        if(checkBtn) checkBtn.classList.remove('hidden');
        
        // ★修正ポイント: retryBtn が存在する場合のみ操作する
        const retryBtn = getEl('retryBtn');
        if (retryBtn) retryBtn.classList.add('hidden');
        
        // 新しい2つのボタンも存在確認してから操作
        const retrySameBtn = getEl('retrySameBtn');
        if (retrySameBtn) retrySameBtn.classList.add('hidden');
        const nextBtn = getEl('nextBtn');
        if (nextBtn) nextBtn.classList.add('hidden');
        // ---------------------------------------

        const table = getEl('quizTable');
        table.textContent = ''; 

        let colCount;
        if (config.disableModeSelection) {
            colCount = config.allColHeaders.length;
        } else {
            colCount = (currentMode === 'basic' && config.basicColCount) 
                       ? config.basicColCount 
                       : config.allColHeaders.length;
        }
        
        const thead = document.createElement('tr');
        thead.appendChild(document.createElement('th')); 
        for (let i = 0; i < colCount; i++) {
            const th = document.createElement('th');
            th.textContent = config.allColHeaders[i];
            thead.appendChild(th);
        }
        table.appendChild(thead);

        let targetIndices;
        
        if (isRetrySame && currentRowIndices.length > 0) {
            targetIndices = currentRowIndices;
        } else {
            targetIndices = selectRowIndices(config.allData.length);
            currentRowIndices = targetIndices; 
        }

        const rate = difficultyRates[currentLevel];
        let tableRows = [];
        let totalBlanks = 0;
        let attempts = 0;

        do {
            tableRows = [];
            totalBlanks = 0;
            attempts++;

            targetIndices.forEach((rIndex) => {
                const fullRowData = config.allData[rIndex];

                let rowCells = [];
                let rowBlankCount = 0;
                let quizTargetCount = 0; 
                
                for (let cIndex = 0; cIndex < colCount; cIndex++) {
                    const cellData = fullRowData[cIndex];
                    let isBlank = false;
                    const isExcluded = config.noQuizColumns && config.noQuizColumns.includes(cIndex);

                    if (cellData !== "-" && !isExcluded) {
                        quizTargetCount++; 
                        if (Math.random() < rate) {
                            isBlank = true;
                            rowBlankCount++;
                            totalBlanks++;
                        }
                    }
                    rowCells.push({
                        text: cellData,
                        isBlank: isBlank,
                        r: rIndex,
                        c: cIndex
                    });
                }

                if (rowBlankCount === quizTargetCount && quizTargetCount > 0) {
                     const blankIndices = rowCells
                        .map((cell, idx) => cell.isBlank ? idx : -1)
                        .filter(idx => idx !== -1);
                     if (blankIndices.length > 0) {
                         const rescueIndex = blankIndices[Math.floor(Math.random() * blankIndices.length)];
                         rowCells[rescueIndex].isBlank = false;
                         totalBlanks--; 
                     }
                }
                tableRows.push(rowCells);
            });
            
        } while (totalBlanks < 2 && attempts < 100);

        tableRows.forEach((rowCells) => {
            const originalRIndex = rowCells[0].r;
            const tr = document.createElement('tr');
            const rowHead = document.createElement('td');
            rowHead.classList.add('row-header');
            rowHead.textContent = config.rowHeaders[originalRIndex];
            tr.appendChild(rowHead);

            rowCells.forEach(cell => {
                const td = document.createElement('td');
                if (cell.text === "-") {
                    td.textContent = "-";
                } else if (cell.isBlank) {
                    const input = document.createElement('input');
                    input.type = "text";
                    input.dataset.r = cell.r;
                    input.dataset.c = cell.c;
                    input.autocomplete = "off";
                    td.appendChild(input);
                } else {
                    td.textContent = cell.text;
                }
                tr.appendChild(td);
            });
            table.appendChild(tr);
        });

        const firstInput = table.querySelector('input[type="text"]');
        if (firstInput && window.innerWidth > 600) { 
            firstInput.focus(); 
        }
    }

    function checkAnswers() {
        const inputs = document.querySelectorAll('input[type="text"]');
        let correctCount = 0;
        let totalCount = inputs.length;

        if (totalCount === 0) return;

        inputs.forEach(input => {
            const r = input.dataset.r;
            const c = input.dataset.c;
            const correctVal = config.allData[r][c];
            const userVal = input.value.trim();
            const parentTd = input.parentElement;

            input.disabled = true;

            if (userVal.toLowerCase() === correctVal.toLowerCase()) {
                parentTd.textContent = correctVal; 
                parentTd.classList.add('correct-cell');
                correctCount++;
            } else {
                parentTd.classList.add('incorrect-cell');
                const hint = document.createElement('div');
                hint.classList.add('answer-hint');
                hint.textContent = `(${correctVal})`;
                parentTd.appendChild(hint);
            }
        });

        getEl('checkBtn').classList.add('hidden');
        
        // ボタンの表示制御
        const retrySameBtn = getEl('retrySameBtn');
        const nextBtn = getEl('nextBtn');
        if (retrySameBtn && nextBtn) {
            retrySameBtn.classList.remove('hidden');
            nextBtn.classList.remove('hidden');
        } else {
            const retryBtn = getEl('retryBtn');
            if (retryBtn) retryBtn.classList.remove('hidden');
        }

        if (correctCount >= (totalCount - 1)) {
            const msgArea = getEl('messageArea');
            if (correctCount === totalCount) {
                msgArea.textContent = "🎉 Perfect!! 全問正解です！ 🎉";
                msgArea.className = 'msg-success';
            } else if (totalCount >= 2 && correctCount === (totalCount - 1)) {
                msgArea.textContent = "惜しい！ あと1問です！";
                msgArea.className = 'msg-veryclose';
            }
            msgArea.style.display = 'block';
        }
    }

    return { init, setDifficulty, changeMode, setRowCount, resetQuiz, checkAnswers };
})();
