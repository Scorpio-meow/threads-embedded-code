// Popup Script for Threads Saver Extension

let allArticles = [];
let filteredArticles = [];

// 載入時初始化
document.addEventListener('DOMContentLoaded', async () => {
  await loadArticles();
  setupEventListeners();
});

async function loadArticles() {
  const result = await chrome.storage.local.get(['savedArticles']);
  allArticles = result.savedArticles || [];
  filteredArticles = [...allArticles];
  renderArticles();
}

function setupEventListeners() {
  // 搜尋功能
  document.getElementById('searchInput').addEventListener('input', (e) => {
    const searchTerm = e.target.value.toLowerCase();
    filteredArticles = allArticles.filter(article => {
      const contentMatch = (article.content || '').toLowerCase().includes(searchTerm);
      const authorMatch = (article.author || '').toLowerCase().includes(searchTerm);
      const tagsMatch = (article.tags || []).some(tag => (tag || '').toLowerCase().includes(searchTerm));
      const codeMatch = (article.codeBlocks || []).some(block => 
        (block.code || '').toLowerCase().includes(searchTerm) ||
        (block.language || '').toLowerCase().includes(searchTerm)
      );
      const embedMatch = (article.embedCode || '').toLowerCase().includes(searchTerm);
      return contentMatch || authorMatch || tagsMatch || codeMatch || embedMatch;
    });
    renderArticles();
  });

  // 導出功能
  document.getElementById('exportBtn').addEventListener('click', exportAllEmbedCodes);

  // 清除全部
  document.getElementById('clearBtn').addEventListener('click', clearAllArticles);
}

function renderArticles() {
  const container = document.getElementById('articlesContainer');
  const countElement = document.getElementById('articleCount');
  
  countElement.textContent = `${filteredArticles.length} 篇`;

  if (filteredArticles.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
          <path d="M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0l4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4z"/>
        </svg>
        <p>${allArticles.length === 0 ? '尚未儲存任何程式碼' : '找不到符合的程式碼'}</p>
        ${allArticles.length === 0 ? '<p style="font-size: 12px; margin-top: 8px;">在 Threads 含程式碼的文章旁點擊儲存按鈕</p>' : ''}
      </div>
    `;
    return;
  }

  container.innerHTML = filteredArticles.map(article => `
    <div class="article-card" data-id="${article.id}">
      <div class="article-header">
        <div class="author">${escapeHtml(article.author || '')}</div>
        <div class="time">${formatTime(article.savedAt)}</div>
      </div>
      <div class="article-content">${escapeHtml((article.content || '').substring(0, 200))}${(article.content || '').length > 200 ? '...' : ''}</div>
      ${article.embedCode ? `<div class="embed-snippet">${escapeHtml(article.embedCode.substring(0, 300))}${article.embedCode.length > 300 ? '\n...' : ''}</div>` : ''}
      ${article.tags && article.tags.length > 0 ? `
        <div class="tags">
          ${article.tags.map(tag => `<span class="tag">#${escapeHtml(tag)}</span>`).join('')}
        </div>
      ` : ''}
      ${article.codeBlocks && article.codeBlocks.length > 0 ? `
        <div class="code-blocks">
          ${article.codeBlocks.map((block, idx) => `
            <div class="code-block">
              <div class="code-header">
                <span class="code-language">${escapeHtml(block.language)}</span>
                <button class="code-copy-btn" data-article-id="${article.id}" data-index="${idx}">複製</button>
              </div>
              <div class="code-content">${escapeHtml(block.code.substring(0, 500))}${block.code.length > 500 ? '\n...' : ''}</div>
            </div>
          `).join('')}
        </div>
      ` : ''}
      ${article.images && article.images.length > 0 ? `
        <div class="article-images">
          ${article.images.slice(0, 3).map(img => `
            <img src="${img}" alt="程式碼截圖">
          `).join('')}
        </div>
      ` : ''}
      <div class="article-actions">
        <a href="${article.postLink}" target="_blank" class="action-btn">查看原文</a>
        ${article.embedCode ? `<button class="action-btn copy-embed-btn" data-article-id="${article.id}">複製內嵌程式碼</button>` : ''}
        <button class="action-btn delete-btn delete-article-btn" data-article-id="${article.id}">刪除</button>
      </div>
    </div>
  `).join('');
  
  // 綁定事件監聽器
  container.querySelectorAll('.copy-embed-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const articleId = btn.dataset.articleId;
      copyEmbed(articleId);
    });
  });
  
  container.querySelectorAll('.delete-article-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const articleId = btn.dataset.articleId;
      deleteArticle(articleId);
    });
  });
  
  container.querySelectorAll('.code-copy-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const articleId = btn.dataset.articleId;
      const index = parseInt(btn.dataset.index);
      copyCodeBlock(articleId, index);
    });
  });
}

function formatTime(isoString) {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return '剛剛';
  if (diffMins < 60) return `${diffMins} 分鐘前`;
  if (diffHours < 24) return `${diffHours} 小時前`;
  if (diffDays < 7) return `${diffDays} 天前`;
  
  return date.toLocaleDateString('zh-TW', { 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric' 
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// 刪除文章
async function deleteArticle(articleId) {
  console.log('[Popup] deleteArticle called with ID:', articleId);
  if (!confirm('確定要刪除這篇文章嗎?')) return;

  allArticles = allArticles.filter(article => article.id !== articleId);
  await chrome.storage.local.set({ savedArticles: allArticles });
  
  filteredArticles = filteredArticles.filter(article => article.id !== articleId);
  renderArticles();
  showToast('✅ 已刪除');
}

window.copyArticle = async function(articleId) {
  const article = allArticles.find(a => a.id === articleId);
  if (!article) return;

  const textToCopy = `${article.author}\n\n${article.content}\n\n來源: ${article.postLink}`;
  
  try {
    await navigator.clipboard.writeText(textToCopy);
    showToast('已複製到剪貼簿');
  } catch (err) {
    console.error('複製失敗:', err);
  }
};

// 複製單個程式碼區塊
async function copyCodeBlock(articleId, blockIndex) {
  console.log('[Popup] copyCodeBlock called:', articleId, blockIndex);
  const article = allArticles.find(a => a.id === articleId);
  if (!article || !article.codeBlocks || !article.codeBlocks[blockIndex]) return;

  const codeBlock = article.codeBlocks[blockIndex];
  
  try {
    await navigator.clipboard.writeText(codeBlock.code);
    showToast('✅ 已複製程式碼');
  } catch (err) {
    console.error('複製程式碼失敗:', err);
    showToast('❌ 複製失敗');
  }
}

// 複製所有程式碼區塊
window.copyAllCode = async function(articleId) {
  const article = allArticles.find(a => a.id === articleId);
  if (!article || !article.codeBlocks || article.codeBlocks.length === 0) return;

  const allCode = article.codeBlocks.map((block, idx) => 
    `// --- ${block.language.toUpperCase()} (Block ${idx + 1}) ---\n${block.code}`
  ).join('\n\n');
  
  const textToCopy = `${article.author}\n${article.postLink}\n\n${allCode}`;
  
  try {
    await navigator.clipboard.writeText(textToCopy);
    showToast(`已複製 ${article.codeBlocks.length} 個程式碼區塊`);
  } catch (err) {
    console.error('複製失敗:', err);
  }
};

// 複製內嵌程式碼
async function copyEmbed(articleId) {
  console.log('[Popup] copyEmbed called with ID:', articleId);
  const article = allArticles.find(a => a.id === articleId);
  console.log('[Popup] Found article:', article ? 'Yes' : 'No');
  console.log('[Popup] Has embedCode:', article?.embedCode ? 'Yes' : 'No');
  
  if (!article || !article.embedCode) {
    showToast('❌ 找不到內嵌程式碼');
    return;
  }
  
  try {
    await navigator.clipboard.writeText(article.embedCode);
    console.log('[Popup] 複製成功');
    showToast('✅ 已複製內嵌程式碼');
  } catch (err) {
    console.error('[Popup] 複製失敗:', err);
    showToast('❌ 複製失敗: ' + err.message);
  }
}

// 導出所有內嵌程式碼
async function exportAllEmbedCodes() {
  if (allArticles.length === 0) {
    showToast('❌ 沒有內嵌程式碼可以導出');
    return;
  }

  // 只導出有 embedCode 的文章
  const articlesWithEmbed = allArticles.filter(a => a.embedCode);
  
  if (articlesWithEmbed.length === 0) {
    showToast('❌ 沒有內嵌程式碼可以導出');
    return;
  }

  // 生成純內嵌程式碼的 HTML 文件
  const embedCodes = articlesWithEmbed.map(article => article.embedCode).join('\n');
  
  const html = `<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Threads 內嵌程式碼 - ${new Date().toLocaleDateString('zh-TW')}</title>
</head>
<body>
${embedCodes}
</body>
</html>`;

  // 下載 HTML 文件
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `threads-embed-codes-${new Date().toISOString().split('T')[0]}.html`;
  link.click();
  URL.revokeObjectURL(url);
  
  showToast(`✅ 已導出 ${articlesWithEmbed.length} 個內嵌程式碼`);
}

async function clearAllArticles() {
  if (allArticles.length === 0) {
    alert('沒有文章可以清除');
    return;
  }

  if (!confirm(`確定要清除全部 ${allArticles.length} 篇文章嗎？此操作無法復原！`)) {
    return;
  }

  await chrome.storage.local.set({ savedArticles: [] });
  allArticles = [];
  filteredArticles = [];
  renderArticles();
  showToast('✅ 已清除所有文章');
}

function showToast(message) {
  const toast = document.createElement('div');
  toast.style.cssText = `
    position: fixed;
    top: 70px;
    left: 50%;
    transform: translateX(-50%);
    background: #000;
    color: white;
    padding: 8px 16px;
    border-radius: 6px;
    font-size: 13px;
    z-index: 1000;
    animation: fadeIn 0.2s ease;
  `;
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'fadeOut 0.2s ease';
    setTimeout(() => toast.remove(), 200);
  }, 2000);
}
