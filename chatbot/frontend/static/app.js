document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const chatBox = document.getElementById('chatBox');
    const chatForm = document.getElementById('chatForm');
    const userInput = document.getElementById('userInput');
    const sessionList = document.getElementById('sessionList');
    const chatTitle = document.getElementById('chatTitle');
    const sidebar = document.getElementById('sidebar');
    const toggleSidebarBtn = document.getElementById('toggleSidebarBtn');
    
    // Upload Elements
    const openUploadBtn = document.getElementById('openUploadBtn');
    const uploadModal = document.getElementById('uploadModal');
    const uploadCloseBtn = document.getElementById('uploadCloseBtn');
    const fileInput = document.getElementById('fileInput');
    const uploadBtn = document.getElementById('uploadBtn');
    const uploadStatus = document.getElementById('uploadStatus');

    // Settings Elements
    const settingsBtn = document.getElementById('settingsBtn');
    const settingsModal = document.getElementById('settingsModal');
    const settingsCloseBtn = settingsModal.querySelector('.close-btn');
    const saveSettingsBtn = document.getElementById('saveSettingsBtn');
    const apiKeyInput = document.getElementById('apiKeyInput');
    const clearApiKeyBtn = document.getElementById('clearApiKeyBtn');
    const modelSelect = document.getElementById('modelSelect');

    let currentSessionId = null;
    let chatHistory = []; 

    marked.setOptions({
        highlight: function(code, lang) {
            const language = hljs.getLanguage(lang) ? lang : 'plaintext';
            return hljs.highlight(code, { language }).value;
        },
        breaks: true
    });

    fetchSessions();
    fetchModels();

    // Toggle Sidebar
    toggleSidebarBtn.onclick = () => {
        sidebar.classList.toggle('closed');
    };

    // Sessions
    async function fetchSessions() {
        try {
            const res = await fetch('/api/sessions');
            const data = await res.json();
            renderSessions(data.sessions);
            if (data.sessions.length > 0 && !currentSessionId) {
                switchSession(data.sessions[0].id, data.sessions[0].title);
            } else if (!currentSessionId) {
                createNewSession();
            }
        } catch(e) { console.error(e); }
    }

    function renderSessions(sessions) {
        sessionList.innerHTML = '';
        sessions.forEach(s => {
            const li = document.createElement('li');
            li.textContent = s.title;
            li.dataset.id = s.id;
            if(s.id === currentSessionId) li.classList.add('active');
            li.onclick = () => switchSession(s.id, s.title);
            sessionList.appendChild(li);
        });
    }

    async function createNewSession() {
        try {
            const res = await fetch('/api/sessions', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({title: "New Chat"})
            });
            const data = await res.json();
            await fetchSessions();
            switchSession(data.session_id, data.title);
        } catch(e) { console.error(e); }
    }

    document.getElementById('newChatBtn').onclick = createNewSession;

    async function switchSession(id, title) {
        currentSessionId = id;
        chatTitle.textContent = title;
        chatBox.innerHTML = '';
        chatHistory = [];
        
        document.querySelectorAll('.session-list li').forEach(li => li.classList.remove('active'));
        const activeLi = document.querySelector(`.session-list li[data-id="${id}"]`);
        if(activeLi) activeLi.classList.add('active');

        try {
            const res = await fetch(`/api/sessions/${id}/messages`);
            const data = await res.json();
            if(data.messages.length === 0) {
                appendMessage('system', "Hello! Need to process a document? Click **Upload Data** in the top right corner to inject context into this chat.", null, false);
            } else {
                data.messages.forEach(msg => {
                    chatHistory.push({role: msg.role === 'user' ? 'user' : 'assistant', content: msg.content});
                    let provider_val = msg.provider ? msg.provider : 'db-cache';
                    let metrics = (msg.role !== 'user' && msg.tokens_used > 0) ? {tokens: msg.tokens_used, time: msg.time_taken, provider: provider_val} : null;
                    appendMessage(msg.role === 'user' ? 'user' : 'bot', msg.content, metrics, false);
                });
            }
        } catch(e) { console.error(e); }
    }

    // Upload Data Modal
    openUploadBtn.onclick = () => uploadModal.classList.add('show');
    uploadCloseBtn.onclick = () => uploadModal.classList.remove('show');
    uploadBtn.onclick = () => fileInput.click();
    
    fileInput.onchange = async (e) => {
        const file = e.target.files[0];
        if(!file) return;

        const scope = document.querySelector('input[name="scope"]:checked').value;
        const formData = new FormData();
        formData.append('file', file);
        formData.append('scope', scope);
        if(scope === 'local') formData.append('session_id', currentSessionId);

        uploadStatus.textContent = `Uploading ${file.name}...`;
        uploadStatus.className = 'status-msg';

        try {
            const response = await fetch('/upload', { method: 'POST', body: formData });
            const data = await response.json();
            if(response.ok) {
                uploadStatus.textContent = '✅ ' + data.message;
                uploadStatus.classList.remove('error');
                setTimeout(() => uploadModal.classList.remove('show'), 2000);
            } else {
                uploadStatus.textContent = '❌ ' + (data.error || 'Upload failed.');
                uploadStatus.classList.add('error');
            }
        } catch(error) {
            uploadStatus.textContent = 'Network error during upload.';
            uploadStatus.classList.add('error');
        }
    };

    // Chat Form
    userInput.addEventListener('keydown', (e) => {
        if(e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            chatForm.dispatchEvent(new Event('submit'));
        }
    });

    chatForm.onsubmit = async (e) => {
        e.preventDefault();
        const message = userInput.value.trim();
        if(!message) return;

        appendMessage('user', message, null, false);
        userInput.value = '';
        
        const typingId = appendTypingIndicator();
        const isFirstMessage = chatHistory.length === 0;
        
        try {
            const customApiKey = localStorage.getItem('chatbot_api_key') || null;
            const customModel = localStorage.getItem('chatbot_model') || null;

            const res = await fetch('/chat', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    query: message,
                    history: chatHistory,
                    session_id: currentSessionId,
                    api_key: customApiKey,
                    model: customModel
                })
            });

            const data = await res.json();
            removeTypingIndicator(typingId);

            if(res.ok) {
                chatHistory.push({role: 'user', content: message});
                chatHistory.push({role: 'assistant', content: data.response});
                appendMessage('bot', data.response, {tokens: data.tokens, time: data.time, provider: data.provider, context_chunks: data.context_chunks}, true);
                
                // If this was the first message, generate a title in the background
                if(isFirstMessage) triggerTitleGeneration(message, customApiKey, customModel);
                
            } else {
                appendMessage('bot', '❌ Error: ' + (data.error || 'Server failure'), null, false);
            }
        } catch(error) {
            removeTypingIndicator(typingId);
            appendMessage('bot', '❌ Remote network error.', null, false);
        }
    };

    async function triggerTitleGeneration(firstMessage, customApiKey, customModel) {
        try {
            const res = await fetch(`/api/sessions/${currentSessionId}/title`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    message: firstMessage,
                    api_key: customApiKey,
                    model: customModel
                })
            });
            const data = await res.json();
            if(data.title) {
                chatTitle.textContent = data.title;
                const activeLi = document.querySelector(`.session-list li[data-id="${currentSessionId}"]`);
                if(activeLi) activeLi.textContent = data.title;
            }
        } catch (e) {
            console.error("Title generation silently failed", e);
        }
    }

    function appendMessage(sender, text, metrics, animate) {
        const wrap = document.createElement('div');
        wrap.className = `message ${sender}-msg`;
        if(!animate) wrap.style.animation = 'none';
        let avatar = sender === 'user' ? '👤' : '🤖';
        let parsedText = sender === 'user' ? escapeHTML(text) : marked.parse(text);
        
        let detailsHTML = '';
        if (metrics && metrics.context_chunks && metrics.context_chunks.length > 0) {
            let chunkList = metrics.context_chunks.map((c, i) => {
                let m = c.metadata || {};
                let spanItems = [];
                if(m.file_type) spanItems.push(`<span>${m.file_type.toUpperCase()}</span>`);
                if(m.keywords) spanItems.push(`<span>🔑 ${m.keywords}</span>`);
                let metaHTML = spanItems.length > 0 ? `<div class="chunk-meta">${spanItems.join('')}</div>` : '';
                return `<div class="chunk-item">${metaHTML}<div class="chunk-text">${escapeHTML(c.text.substring(0, 150))}...</div></div>`;
            }).join('');
            
            detailsHTML = `
            <details class="context-details">
                <summary>📚 View RAG Context (${metrics.context_chunks.length} chunks)</summary>
                ${chunkList}
            </details>`;
        }
        
        let metricsHTML = '';
        if(metrics && metrics.tokens > 0) {
            metricsHTML = `
            <div class="metrics-badge">
                <span>⚡ ${metrics.provider}</span>
                <span>⏱️ ${metrics.time}s</span>
                <span>📊 ${metrics.tokens} tkns</span>
            </div>`;
        }
        wrap.innerHTML = `<div class="avatar">${avatar}</div><div class="bubble-wrap"><div class="bubble">${parsedText}${detailsHTML}</div>${metricsHTML}</div>`;
        chatBox.appendChild(wrap);
        chatBox.scrollTop = chatBox.scrollHeight;
    }

    function appendTypingIndicator() {
        const id = 'typing-' + Date.now();
        const wrap = document.createElement('div');
        wrap.id = id;
        wrap.className = 'message bot-msg';
        wrap.innerHTML = `<div class="avatar">🤖</div><div class="bubble-wrap"><div class="bubble"><span class="loading"></span> Computing...</div></div>`;
        chatBox.appendChild(wrap);
        chatBox.scrollTop = chatBox.scrollHeight;
        return id;
    }

    function removeTypingIndicator(id) { document.getElementById(id)?.remove(); }
    function escapeHTML(str) { return String(str).replace(/[&<>'"]/g, t => ({'&': '&amp;','<': '&lt;','>': '&gt;',"'": '&#39;','"': '&quot;'}[t])); }

    // Settings
    settingsBtn.onclick = () => settingsModal.classList.add('show');
    settingsCloseBtn.onclick = () => settingsModal.classList.remove('show');
    clearApiKeyBtn.onclick = () => {
        apiKeyInput.value = '';
        localStorage.removeItem('chatbot_api_key');
    };
    
    window.onclick = (e) => { 
        if (e.target == settingsModal) settingsModal.classList.remove('show'); 
        if (e.target == uploadModal) uploadModal.classList.remove('show'); 
    };

    async function fetchModels() {
        try {
            const res = await fetch('/api/models');
            const data = await res.json();
            
            const orGrp = document.getElementById('orModelGroup');
            data.openrouter.forEach(m => {
                const opt = document.createElement('option');
                opt.value = m; opt.textContent = m;
                orGrp.appendChild(opt);
            });
            const hfGrp = document.getElementById('hfModelGroup');
            data.huggingface.forEach(m => {
                const opt = document.createElement('option');
                opt.value = m; opt.textContent = m;
                hfGrp.appendChild(opt);
            });

            if(localStorage.getItem('chatbot_model')) modelSelect.value = localStorage.getItem('chatbot_model');
            if(localStorage.getItem('chatbot_api_key')) apiKeyInput.value = localStorage.getItem('chatbot_api_key');
        } catch(e) {}
    }

    saveSettingsBtn.onclick = () => {
        if(apiKeyInput.value.trim() !== '') localStorage.setItem('chatbot_api_key', apiKeyInput.value.trim());
        else localStorage.removeItem('chatbot_api_key');
        if(modelSelect.value !== '') localStorage.setItem('chatbot_model', modelSelect.value);
        else localStorage.removeItem('chatbot_model');
        settingsModal.classList.remove('show');
    };
});
