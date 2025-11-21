// Popup Script for Threads Saver Extension

let allArticles = [];
let filteredArticles = [];

function refreshEmbedCode(articleId) {
  const article = allArticles.find(a => a.id === articleId);
  if (!article || !article.postLink) {
    console.error('[Popup] 找不到文章或文章連結:', articleId);
    showToast('找不到文章連結');
    return false;
  }
  
  console.log('[Popup] 重新生成嵌入代碼:', article.postLink);
  showToast('正在重新生成...');
  
  const newEmbedCode = buildThreadsEmbedCode(article.postLink);
  
  if (!newEmbedCode) {
    console.error('[Popup] 無法生成嵌入代碼');
    showToast('生成失敗');
    return false;
  }
  
  // 更新文章的 embedCode
  article.embedCode = newEmbedCode;
  article.lastUpdated = new Date().toISOString();
  
  // 儲存到 storage
  chrome.storage.local.set({ savedArticles: allArticles }).then(() => {
    // 更新顯示
    filteredArticles = allArticles.filter(a => 
      filteredArticles.some(fa => fa.id === a.id)
    );
    renderArticles();
    showToast('嵌入代碼已重新生成');
  });
  
  return true;
}

function refreshAllEmbedCodes() {
  if (allArticles.length === 0) {
    showToast('沒有文章可以重新生成');
    return;
  }
  
  if (!confirm(`確定要重新生成全部 ${allArticles.length} 篇文章的嵌入代碼嗎？`)) {
    return;
  }
  
  showToast(`正在重新生成 ${allArticles.length} 篇文章...`);
  
  let successCount = 0;
  let failCount = 0;
  
  allArticles.forEach(article => {
    if (!article.postLink) {
      failCount++;
      return;
    }
    
    const newEmbedCode = buildThreadsEmbedCode(article.postLink);
    
    if (newEmbedCode) {
      article.embedCode = newEmbedCode;
      article.lastUpdated = new Date().toISOString();
      successCount++;
    } else {
      failCount++;
    }
  });
  
  // 儲存到 storage
  chrome.storage.local.set({ savedArticles: allArticles }).then(() => {
    // 更新顯示
    filteredArticles = [...allArticles];
    renderArticles();
    showToast(`✅ 完成！成功: ${successCount}, 失敗: ${failCount}`);
  });
}

// 生成 Threads 嵌入代碼（與 content.js 相同的邏輯）
function buildThreadsEmbedCode(postLink) {
  if (!postLink) return '';
  
  const match = postLink.match(/\/post\/([^\/\?]+)/);
  const postId = match ? match[1] : '';
  
  return (
    `<blockquote class="text-post-media" data-text-post-permalink="${postLink}" data-text-post-version="0" id="ig-tp-${postId}" style=" background:#FFF; border-width: 1px; border-style: solid; border-color: #00000026; border-radius: 16px; max-width:650px; margin: 1px; min-width:270px; padding:0; width:99.375%; width:-webkit-calc(100% - 2px); width:calc(100% - 2px);"> <a href="${postLink}" style=" background:#FFFFFF; line-height:0; padding:0 0; text-align:center; text-decoration:none; width:100%; font-family: -apple-system, BlinkMacSystemFont, sans-serif;" target="_blank"> <div style=" padding: 40px; display: flex; flex-direction: column; align-items: center;"><div style=" display:block; height:32px; width:32px; padding-bottom:20px;"> <svg aria-label="Threads" height="32px" role="img" viewBox="0 0 192 192" width="32px" xmlns="http://www.w3.org/2000/svg"> <path d="M141.537 88.9883C140.71 88.5919 139.87 88.2104 139.019 87.8451C137.537 60.5382 122.616 44.905 97.5619 44.745C97.4484 44.7443 97.3355 44.7443 97.222 44.7443C82.2364 44.7443 69.7731 51.1409 62.102 62.7807L75.881 72.2328C81.6116 63.5383 90.6052 61.6848 97.2286 61.6848C97.3051 61.6848 97.3819 61.6848 97.4576 61.6855C105.707 61.7381 111.932 64.1366 115.961 68.814C118.893 72.2193 120.854 76.925 121.825 82.8638C114.511 81.6207 106.601 81.2385 98.145 81.7233C74.3247 83.0954 59.0111 96.9879 60.0396 116.292C60.5615 126.084 65.4397 134.508 73.775 140.011C80.8224 144.663 89.899 146.938 99.3323 146.423C111.79 145.74 121.563 140.987 128.381 132.296C133.559 125.696 136.834 117.143 138.28 106.366C144.217 109.949 148.617 114.664 151.047 120.332C155.179 129.967 155.42 145.8 142.501 158.708C131.182 170.016 117.576 174.908 97.0135 175.059C74.2042 174.89 56.9538 167.575 45.7381 153.317C35.2355 139.966 29.8077 120.682 29.6052 96C29.8077 71.3178 35.2355 52.0336 45.7381 38.6827C56.9538 24.4249 74.2039 17.11 97.0132 16.9405C119.988 17.1113 137.539 24.4614 149.184 38.788C154.894 45.8136 159.199 54.6488 162.037 64.9503L178.184 60.6422C174.744 47.9622 169.331 37.0357 161.965 27.974C147.036 9.60668 125.202 0.195148 97.0695 0H96.9569C68.8816 0.19447 47.2921 9.6418 32.7883 28.0793C19.8819 44.4864 13.2244 67.3157 13.0007 95.9325L13 96L13.0007 96.0675C13.2244 124.684 19.8819 147.514 32.7883 163.921C47.2921 182.358 68.8816 191.806 96.9569 192H97.0695C122.03 191.827 139.624 185.292 154.118 170.811C173.081 151.866 172.51 128.119 166.26 113.541C161.776 103.087 153.227 94.5962 141.537 88.9883ZM98.4405 129.507C88.0005 130.095 77.1544 125.409 76.6196 115.372C76.2232 107.93 81.9158 99.626 99.0812 98.6368C101.047 98.5234 102.976 98.468 104.871 98.468C111.106 98.468 116.939 99.0737 122.242 100.233C120.264 124.935 108.662 128.946 98.4405 129.507Z" /></svg></div><div style=" font-size: 15px; line-height: 21px; color: #000000; font-weight: 600; "> 在 Threads 查看</div></div></a></blockquote>\n` +
    `<script async src="https://www.threads.com/embed.js"></script>`
  );
}

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

  // 更新全部嵌入代碼
  const refreshAllBtn = document.getElementById('refreshAllBtn');
  if (refreshAllBtn) {
    refreshAllBtn.addEventListener('click', refreshAllEmbedCodes);
  }

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
        ${allArticles.length === 0 ? '<p class="empty-help">在 Threads 含程式碼的文章旁點擊儲存按鈕</p>' : ''}
      </div>
    `;
    return;
  }

  container.innerHTML = filteredArticles.map(article => {
    return `
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
      <div class="article-actions">
        <a href="${article.postLink}" target="_blank" class="action-btn">查看原文</a>
        ${article.embedCode ? `<button class="action-btn copy-embed-btn" data-article-id="${article.id}">複製內嵌程式碼</button>` : ''}
        ${article.postLink ? `<button class="action-btn refresh-embed-btn" data-article-id="${article.id}">重新生成</button>` : ''}
        <button class="action-btn delete-btn delete-article-btn" data-article-id="${article.id}">刪除</button>
      </div>
    </div>
  `;
  }).join('');
  
  // 綁定事件監聽器
  container.querySelectorAll('.copy-embed-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const articleId = btn.dataset.articleId;
      copyEmbed(articleId);
    });
  });
  
  container.querySelectorAll('.refresh-embed-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const articleId = btn.dataset.articleId;
      refreshEmbedCode(articleId);
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

  // 生成 JavaScript 陣列格式
  const postsArray = articlesWithEmbed.map((article) => {
    // 移除 embedCode 中的 script 標籤,只保留 blockquote
    const blockquoteOnly = article.embedCode
      .replace(/<script[^>]*>.*?<\/script>/g, '')
      .trim();
    
    // 跳脫單引號
    const escapedCode = blockquoteOnly.replace(/'/g, "\\'");
    
    return `            '${escapedCode}'`;
  }).join(',\n');
  
  const jsContent = `        const posts = [
${postsArray},
        ];`;

  // 下載 JS 文件
  const blob = new Blob([jsContent], { type: 'text/javascript;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `threads-embed-codes-${new Date().toISOString().split('T')[0]}.js`;
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
