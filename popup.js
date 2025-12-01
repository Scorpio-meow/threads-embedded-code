let allArticles = [];
let filteredArticles = [];
let currentSort = 'savedAt-desc';
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
  article.embedCode = newEmbedCode;
  article.lastUpdated = new Date().toISOString();
  chrome.storage.local.set({ savedArticles: allArticles }).then(() => {
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
  chrome.storage.local.set({ savedArticles: allArticles }).then(() => {
    filteredArticles = [...allArticles];
    renderArticles();
    showToast(`完成！成功: ${successCount}, 失敗: ${failCount}`);
  });
}
async function updateAllTimestamps() {
  if (allArticles.length === 0) {
    showToast('沒有文章可以更新');
    return;
  }
  const articlesNeedingUpdate = allArticles.filter(a => a.postLink);
  if (articlesNeedingUpdate.length === 0) {
    showToast('沒有有效的文章連結');
    return;
  }
  if (!confirm(`確定要更新 ${articlesNeedingUpdate.length} 篇文章的時間和內文嗎？\n\n這會開啟分頁逐一訪問每篇文章，可能需要一些時間。\n分頁會在完成後自動關閉。`)) {
    return;
  }
  showToast(`開始更新 ${articlesNeedingUpdate.length} 篇文章...`);
  let successCount = 0;
  let failCount = 0;
  let currentIndex = 0;
  for (const article of allArticles) {
    if (!article.postLink) {
      continue;
    }
    currentIndex++;
    try {
      const postInfo = await fetchPostInfoViaTab(article.postLink);
      if (postInfo) {
        if (postInfo.datetime) {
          article.timestamp = postInfo.datetime;
          article.timestampTitle = postInfo.title || '';
        }
        if (postInfo.content && !postInfo.content.includes('加入 Threads 即可分享意見')) {
          article.content = postInfo.content;
        }
        article.timestampUpdatedAt = new Date().toISOString();
        successCount++;
        console.log(`[Popup] 更新成功 (${currentIndex}/${articlesNeedingUpdate.length}):`, article.postLink, postInfo);
      } else {
        failCount++;
        console.log(`[Popup] 更新失敗 (${currentIndex}/${articlesNeedingUpdate.length}):`, article.postLink);
      }
    } catch (err) {
      failCount++;
      console.error(`[Popup] 更新錯誤 (${currentIndex}/${articlesNeedingUpdate.length}):`, article.postLink, err);
    }
    if (currentIndex % 5 === 0) {
      showToast(`進度: ${currentIndex}/${articlesNeedingUpdate.length} (成功: ${successCount})`);
    }
  }
  await chrome.storage.local.set({ savedArticles: allArticles });
  filteredArticles = [...allArticles];
  sortArticles();
  renderArticles();
  showToast(`更新完成！成功: ${successCount}, 失敗: ${failCount}`);
}
async function fetchPostInfoViaTab(postLink) {
  let tab = null;
  try {
    const safeUrl = sanitizeUrl(postLink);
    if (safeUrl === '#') {
      console.warn('[Popup] fetchPostTimestampViaTab: 略過不安全的連結', postLink);
      return null;
    }
    tab = await chrome.tabs.create({
      url: safeUrl,
      active: false
    });
    await waitForTabLoad(tab.id);
    await new Promise(resolve => setTimeout(resolve, 2000));
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractPostInfoFromPage
    });
    await chrome.tabs.remove(tab.id);
    tab = null;
    if (results && results[0] && results[0].result) {
      return results[0].result;
    }
    return null;
  } catch (err) {
    console.error('[Popup] fetchPostTimestampViaTab 錯誤:', err);
    if (tab && tab.id) {
      try {
        await chrome.tabs.remove(tab.id);
      } catch (e) {
      }
    }
    return null;
  }
}
function waitForTabLoad(tabId) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }, 15000);
    const listener = (updatedTabId, changeInfo) => {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        clearTimeout(timeout);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
  });
}
function extractPostInfoFromPage() {
  let datetime = null;
  let title = '';
  let content = '';
  const timeElement = document.querySelector('time[datetime]');
  if (timeElement) {
    datetime = timeElement.getAttribute('datetime');
    title = timeElement.getAttribute('title') || '';
  }
  if (!datetime) {
    const metaTime = document.querySelector('meta[property="article:published_time"]');
    if (metaTime) {
      datetime = metaTime.getAttribute('content');
    }
  }
  if (!datetime) {
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const script of scripts) {
      try {
        const jsonData = JSON.parse(script.textContent);
        if (jsonData.datePublished) {
          datetime = jsonData.datePublished;
          break;
        }
      } catch (e) {
      }
    }
  }
  const metaDescription = document.querySelector('meta[property="og:description"]');
  if (metaDescription) {
    const metaContent = metaDescription.getAttribute('content') || '';
    if (metaContent && !metaContent.includes('加入 Threads 即可分享意見')) {
      content = metaContent;
    }
  }
  if (!content) {
    const contentSpans = document.querySelectorAll('span[class*="xo1l8bm"][dir="auto"] > span');
    if (contentSpans.length > 0) {
      content = Array.from(contentSpans)
        .filter(span => !span.closest('h1'))
        .map(span => span.innerText)
        .filter(text => text && text.trim())
        .join('\n');
    }
  }
  if (!content) {
    const xi7Spans = document.querySelectorAll('span[class*="xi7mnp6"][dir="auto"] > span');
    if (xi7Spans.length > 0) {
      content = Array.from(xi7Spans)
        .filter(span => !span.closest('h1'))
        .map(span => span.innerText)
        .filter(text => text && text.trim())
        .join('\n');
    }
  }
  if (!datetime && !content) {
    return null;
  }
  return {
    datetime,
    title,
    content
  };
}
function buildThreadsEmbedCode(postLink) {
  if (!postLink) return '';
  const match = postLink.match(/\/post\/([^\/\?]+)/);
  const postId = match ? match[1] : '';
  return (
    `<blockquote class="text-post-media" data-text-post-permalink="${postLink}" data-text-post-version="0" id="ig-tp-${postId}" style=" background:#FFF; border-width: 1px; border-style: solid; border-color: #00000026; border-radius: 16px; max-width:650px; margin: 1px; min-width:270px; padding:0; width:99.375%; width:-webkit-calc(100% - 2px); width:calc(100% - 2px);"> <a href="${postLink}" style=" background:#FFFFFF; line-height:0; padding:0 0; text-align:center; text-decoration:none; width:100%; font-family: -apple-system, BlinkMacSystemFont, sans-serif;" target="_blank"> <div style=" padding: 40px; display: flex; flex-direction: column; align-items: center;"><div style=" display:block; height:32px; width:32px; padding-bottom:20px;"> <svg aria-label="Threads" height="32px" role="img" viewBox="0 0 192 192" width="32px" xmlns="http://www.w3.org/2000/svg"> <path d="M141.537 88.9883C140.71 88.5919 139.87 88.2104 139.019 87.8451C137.537 60.5382 122.616 44.905 97.5619 44.745C97.4484 44.7443 97.3355 44.7443 97.222 44.7443C82.2364 44.7443 69.7731 51.1409 62.102 62.7807L75.881 72.2328C81.6116 63.5383 90.6052 61.6848 97.2286 61.6848C97.3051 61.6848 97.3819 61.6848 97.4576 61.6855C105.707 61.7381 111.932 64.1366 115.961 68.814C118.893 72.2193 120.854 76.925 121.825 82.8638C114.511 81.6207 106.601 81.2385 98.145 81.7233C74.3247 83.0954 59.0111 96.9879 60.0396 116.292C60.5615 126.084 65.4397 134.508 73.775 140.011C80.8224 144.663 89.899 146.938 99.3323 146.423C111.79 145.74 121.563 140.987 128.381 132.296C133.559 125.696 136.834 117.143 138.28 106.366C144.217 109.949 148.617 114.664 151.047 120.332C155.179 129.967 155.42 145.8 142.501 158.708C131.182 170.016 117.576 174.908 97.0135 175.059C74.2042 174.89 56.9538 167.575 45.7381 153.317C35.2355 139.966 29.8077 120.682 29.6052 96C29.8077 71.3178 35.2355 52.0336 45.7381 38.6827C56.9538 24.4249 74.2039 17.11 97.0132 16.9405C119.988 17.1113 137.539 24.4614 149.184 38.788C154.894 45.8136 159.199 54.6488 162.037 64.9503L178.184 60.6422C174.744 47.9622 169.331 37.0357 161.965 27.974C147.036 9.60668 125.202 0.195148 97.0695 0H96.9569C68.8816 0.19447 47.2921 9.6418 32.7883 28.0793C19.8819 44.4864 13.2244 67.3157 13.0007 95.9325L13 96L13.0007 96.0675C13.2244 124.684 19.8819 147.514 32.7883 163.921C47.2921 182.358 68.8816 191.806 96.9569 192H97.0695C122.03 191.827 139.624 185.292 154.118 170.811C173.081 151.866 172.51 128.119 166.26 113.541C161.776 103.087 153.227 94.5962 141.537 88.9883ZM98.4405 129.507C88.0005 130.095 77.1544 125.409 76.6196 115.372C76.2232 107.93 81.9158 99.626 99.0812 98.6368C101.047 98.5234 102.976 98.468 104.871 98.468C111.106 98.468 116.939 99.0737 122.242 100.233C120.264 124.935 108.662 128.946 98.4405 129.507Z" /></svg></div><div style=" font-size: 15px; line-height: 21px; color: #000000; font-weight: 600; "> 在 Threads 查看</div></div></a></blockquote>\n` +
    `<script async src="https://www.threads.com/embed.js"></script>`
  );
}
function sanitizeUrl(rawUrl, base = 'https://www.threads.com') {
  if (!rawUrl || typeof rawUrl !== 'string') return '#';
  try {
    const url = new URL(rawUrl, base);
    if (!['http:', 'https:'].includes(url.protocol)) {
      return '#';
    }
    return url.href;
  } catch (err) {
    return '#';
  }
}
document.addEventListener('DOMContentLoaded', async () => {
  await loadArticles();
  setupEventListeners();
});
async function loadArticles() {
  const result = await chrome.storage.local.get(['savedArticles']);
  allArticles = result.savedArticles || [];
  filteredArticles = [...allArticles];
  sortArticles();
  renderArticles();
}
function setupEventListeners() {
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
    sortArticles();
    renderArticles();
  });
  document.getElementById('exportBtn').addEventListener('click', exportAllEmbedCodes);
  const exportFullBtn = document.getElementById('exportFullBtn');
  if (exportFullBtn) {
    exportFullBtn.addEventListener('click', exportFullData);
  }
  document.getElementById('importBtn').addEventListener('click', () => {
    document.getElementById('importFileInput').click();
  });
  document.getElementById('importFileInput').addEventListener('change', handleImportFile);
  const refreshAllBtn = document.getElementById('refreshAllBtn');
  if (refreshAllBtn) {
    refreshAllBtn.addEventListener('click', refreshAllEmbedCodes);
  }
  const updateTimestampsBtn = document.getElementById('updateTimestampsBtn');
  if (updateTimestampsBtn) {
    updateTimestampsBtn.addEventListener('click', updateAllTimestamps);
  }
  document.getElementById('clearBtn').addEventListener('click', clearAllArticles);
  document.getElementById('sortSelect').addEventListener('change', (e) => {
    currentSort = e.target.value;
    sortArticles();
    renderArticles();
  });
}
function sortArticles() {
  const [field, order] = currentSort.split('-');
  filteredArticles.sort((a, b) => {
    let valueA, valueB;
    const parseDate = (dateStr) => {
      if (!dateStr) return 0;
      const parsed = new Date(dateStr).getTime();
      return isNaN(parsed) ? 0 : parsed;
    };
    switch (field) {
      case 'savedAt':
        valueA = parseDate(a.savedAt);
        valueB = parseDate(b.savedAt);
        break;
      case 'timestamp':
        valueA = parseDate(a.timestamp);
        valueB = parseDate(b.timestamp);
        break;
      case 'author':
        valueA = (a.author || '').toLowerCase();
        valueB = (b.author || '').toLowerCase();
        break;
      case 'codeCount':
        valueA = a.codeCount ?? (a.codeBlocks || []).length;
        valueB = b.codeCount ?? (b.codeBlocks || []).length;
        break;
      default:
        valueA = parseDate(a.savedAt);
        valueB = parseDate(b.savedAt);
    }
    if (typeof valueA === 'string' && typeof valueB === 'string') {
      const comparison = valueA.localeCompare(valueB, 'zh-TW');
      return order === 'asc' ? comparison : -comparison;
    }
    if (order === 'asc') {
      return valueA - valueB;
    } else {
      return valueB - valueA;
    }
  });
}
function renderArticles() {
  const container = document.getElementById('articlesContainer');
  const countElement = document.getElementById('articleCount');
  countElement.textContent = `${filteredArticles.length} 篇`;
  if (filteredArticles.length === 0) {
    container.innerHTML = '';
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'currentColor');
    svg.innerHTML = '<path d="M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0l4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4z"/>';
    empty.appendChild(svg);
    const msg = document.createElement('p');
    msg.textContent = allArticles.length === 0 ? '尚未儲存任何程式碼' : '找不到符合的程式碼';
    empty.appendChild(msg);
    if (allArticles.length === 0) {
      const help = document.createElement('p');
      help.className = 'empty-help';
      help.textContent = '在 Threads 含程式碼的文章旁點擊儲存按鈕';
      empty.appendChild(help);
    }
    container.appendChild(empty);
    return;
  }
  container.innerHTML = '';
  filteredArticles.forEach(article => {
    const card = document.createElement('div');
    card.className = 'article-card';
    card.dataset.id = article.id;
    const header = document.createElement('div');
    header.className = 'article-header';
    const authorEl = document.createElement('div');
    authorEl.className = 'author';
    authorEl.textContent = article.author || '';
    const timeInfo = document.createElement('div');
    timeInfo.className = 'time-info';
    const timePost = document.createElement('div');
    timePost.className = 'time';
    timePost.title = article.timestampTitle || article.timestamp || '';
    timePost.textContent = '發文：' + (article.timestampTitle ? article.timestampTitle : formatTime(article.timestamp));
    const timeSaved = document.createElement('div');
    timeSaved.className = 'time';
    timeSaved.title = article.savedAt || '';
    timeSaved.textContent = '儲存：' + formatTime(article.savedAt);
    timeInfo.appendChild(timePost);
    timeInfo.appendChild(timeSaved);
    header.appendChild(authorEl);
    header.appendChild(timeInfo);
    card.appendChild(header);
    const contentEl = document.createElement('div');
    contentEl.className = 'article-content';
    const contentText = (article.content || '').substring(0, 200);
    contentEl.textContent = contentText + ((article.content || '').length > 200 ? '...' : '');
    card.appendChild(contentEl);
    if (article.embedCode) {
      const embedWrapper = document.createElement('div');
      embedWrapper.className = 'embed-snippet';
      const pre = document.createElement('pre');
      pre.style.margin = '0';
      const code = document.createElement('code');
      const embedText = (article.embedCode || '').substring(0, 300) + ((article.embedCode || '').length > 300 ? '\n...' : '');
      code.textContent = embedText;
      pre.appendChild(code);
      embedWrapper.appendChild(pre);
      card.appendChild(embedWrapper);
    }
    if (article.tags && article.tags.length > 0) {
      const tagsContainer = document.createElement('div');
      tagsContainer.className = 'tags';
      article.tags.forEach(tag => {
        const tagEl = document.createElement('span');
        tagEl.className = 'tag';
        tagEl.textContent = '#' + (tag || '');
        tagsContainer.appendChild(tagEl);
      });
      card.appendChild(tagsContainer);
    }
    if (article.codeBlocks && article.codeBlocks.length > 0) {
      const blocksContainer = document.createElement('div');
      blocksContainer.className = 'code-blocks';
      article.codeBlocks.forEach((block, idx) => {
        const blockEl = document.createElement('div');
        blockEl.className = 'code-block';
        const headerEl = document.createElement('div');
        headerEl.className = 'code-header';
        const langSpan = document.createElement('span');
        langSpan.className = 'code-language';
        langSpan.textContent = block.language || '';
        const copyBtn = document.createElement('button');
        copyBtn.className = 'code-copy-btn';
        copyBtn.setAttribute('data-article-id', article.id);
        copyBtn.setAttribute('data-index', String(idx));
        copyBtn.textContent = '複製';
        headerEl.appendChild(langSpan);
        headerEl.appendChild(copyBtn);
        const blockContent = document.createElement('div');
        blockContent.className = 'code-content';
        const blockPre = document.createElement('pre');
        blockPre.style.margin = '0';
        const blockCode = document.createElement('code');
        const codeText = (block.code || '').substring(0, 500) + ((block.code || '').length > 500 ? '\n...' : '');
        blockCode.textContent = codeText;
        blockPre.appendChild(blockCode);
        blockContent.appendChild(blockPre);
        blockEl.appendChild(headerEl);
        blockEl.appendChild(blockContent);
        blocksContainer.appendChild(blockEl);
      });
      card.appendChild(blocksContainer);
    }
    const actions = document.createElement('div');
    actions.className = 'article-actions';
    const link = document.createElement('a');
    link.className = 'action-btn';
    link.href = sanitizeUrl(article.postLink || '#');
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = '查看原文';
    actions.appendChild(link);
    if (article.embedCode) {
      const copyEmbedBtn = document.createElement('button');
      copyEmbedBtn.className = 'action-btn copy-embed-btn';
      copyEmbedBtn.setAttribute('data-article-id', article.id);
      copyEmbedBtn.textContent = '複製內嵌程式碼';
      actions.appendChild(copyEmbedBtn);
    }
    if (article.postLink) {
      const refreshBtn = document.createElement('button');
      refreshBtn.className = 'action-btn refresh-embed-btn';
      refreshBtn.setAttribute('data-article-id', article.id);
      refreshBtn.textContent = '重新生成';
      actions.appendChild(refreshBtn);
    }
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'action-btn delete-btn delete-article-btn';
    deleteBtn.setAttribute('data-article-id', article.id);
    deleteBtn.textContent = '刪除';
    actions.appendChild(deleteBtn);
    card.appendChild(actions);
    container.appendChild(card);
  });
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
  if (!isoString) return '未知';
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return '未知';
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
async function deleteArticle(articleId) {
  console.log('[Popup] deleteArticle called with ID:', articleId);
  if (!confirm('確定要刪除這篇文章嗎?')) return;
  allArticles = allArticles.filter(article => article.id !== articleId);
  await chrome.storage.local.set({ savedArticles: allArticles });
  filteredArticles = filteredArticles.filter(article => article.id !== articleId);
  renderArticles();
  showToast('已刪除');
}
window.copyArticle = async function (articleId) {
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
async function copyCodeBlock(articleId, blockIndex) {
  console.log('[Popup] copyCodeBlock called:', articleId, blockIndex);
  const article = allArticles.find(a => a.id === articleId);
  if (!article || !article.codeBlocks || !article.codeBlocks[blockIndex]) return;
  const codeBlock = article.codeBlocks[blockIndex];
  try {
    await navigator.clipboard.writeText(codeBlock.code);
    showToast('已複製程式碼');
  } catch (err) {
    console.error('複製程式碼失敗:', err);
    showToast('複製失敗');
  }
}
window.copyAllCode = async function (articleId) {
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
async function copyEmbed(articleId) {
  console.log('[Popup] copyEmbed called with ID:', articleId);
  const article = allArticles.find(a => a.id === articleId);
  console.log('[Popup] Found article:', article ? 'Yes' : 'No');
  console.log('[Popup] Has embedCode:', article?.embedCode ? 'Yes' : 'No');
  if (!article || !article.embedCode) {
    showToast('找不到內嵌程式碼');
    return;
  }
  try {
    await navigator.clipboard.writeText(article.embedCode);
    console.log('[Popup] 複製成功');
    showToast('已複製內嵌程式碼');
  } catch (err) {
    console.error('[Popup] 複製失敗:', err);
    showToast('複製失敗: ' + err.message);
  }
}
async function exportAllEmbedCodes() {
  if (filteredArticles.length === 0) {
    showToast('沒有內嵌程式碼可以匯出');
    return;
  }
  const articlesWithEmbed = filteredArticles.filter(a => a.embedCode);
  if (articlesWithEmbed.length === 0) {
    showToast('沒有內嵌程式碼可以匯出');
    return;
  }
  const postsArray = articlesWithEmbed.map((article) => {
    let blockquoteOnly = article.embedCode;
    let previous;
    do {
      previous = blockquoteOnly;
      blockquoteOnly = blockquoteOnly.replace(/<script\b[^>]*>[\s\S]*?<\/script\b[^>]*>/gi, '');
    } while (blockquoteOnly !== previous);
    blockquoteOnly = blockquoteOnly.trim();
    const escapedCode = blockquoteOnly
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'");

    return `  '${escapedCode}'`;
  }).join(',\n');
  const jsContent = `const posts = [
${postsArray},
  ];`;
  const blob = new Blob([jsContent], { type: 'text/javascript;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `threads-embed-codes-${new Date().toISOString().split('T')[0]}.js`;
  link.click();
  URL.revokeObjectURL(url);
  showToast(`已匯出 ${articlesWithEmbed.length} 個內嵌程式碼`);
}
async function exportFullData() {
  if (filteredArticles.length === 0) {
    showToast('沒有資料可以匯出');
    return;
  }
  const exportData = filteredArticles.map((article) => {
    let blockquoteOnly = article.embedCode || '';
    let previous;
    do {
      previous = blockquoteOnly;
      blockquoteOnly = blockquoteOnly.replace(/<script\b[^>]*>[\s\S]*?<\/script\b[^>]*>/gi, '');
    } while (blockquoteOnly !== previous);
    blockquoteOnly = blockquoteOnly.trim();
    return {
      embedCode: blockquoteOnly,
      postLink: article.postLink || '',
      author: article.author || '',
      content: article.content || '',
      timestamp: article.timestamp || '',
      timestampTitle: article.timestampTitle || '',
      savedAt: article.savedAt || '',
      tags: article.tags || []
    };
  });
  const jsContent = `// Threads 貼文完整資料 - 匯出時間: ${new Date().toLocaleString('zh-TW')}
// 包含: embedCode, postLink, author, content, timestamp, timestampTitle, savedAt, tags
const posts = ${JSON.stringify(exportData, null, 2)};
`;
  const blob = new Blob([jsContent], { type: 'text/javascript;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `threads-full-data-${new Date().toISOString().split('T')[0]}.js`;
  link.click();
  URL.revokeObjectURL(url);
  showToast(`已匯出 ${exportData.length} 筆完整資料`);
}
async function handleImportFile(event) {
  const file = event.target.files[0];
  if (!file) return;
  event.target.value = '';
  try {
    const content = await file.text();
    let importedArticles = [];
    if (file.name.endsWith('.json')) {
      const jsonData = JSON.parse(content);
      if (Array.isArray(jsonData)) {
        importedArticles = jsonData;
      } else if (jsonData.savedArticles && Array.isArray(jsonData.savedArticles)) {
        importedArticles = jsonData.savedArticles;
      } else {
        throw new Error('無效的 JSON 格式');
      }
    } else {
      importedArticles = parseJsEmbedFile(content);
    }
    if (importedArticles.length === 0) {
      showToast('檔案中沒有可匯入的資料');
      return;
    }
    const importMode = confirm(
      `找到 ${importedArticles.length} 筆資料。\n\n` +
      `按「確定」合併到現有資料（跳過重複項目）\n` +
      `按「取消」取代所有現有資料`
    );
    if (importMode) {
      const existingLinks = new Set(allArticles.map(a => a.postLink));
      const newArticles = importedArticles.filter(a => !existingLinks.has(a.postLink));
      if (newArticles.length === 0) {
        showToast('所有項目都已存在，無需匯入');
        return;
      }
      allArticles = [...allArticles, ...newArticles];
      showToast(`已匯入 ${newArticles.length} 筆新資料（跳過 ${importedArticles.length - newArticles.length} 筆重複）`);
    } else {
      allArticles = importedArticles;
      showToast(`已匯入 ${importedArticles.length} 筆資料（取代原有資料）`);
    }
    await chrome.storage.local.set({ savedArticles: allArticles });
    filteredArticles = [...allArticles];
    renderArticles();
  } catch (err) {
    console.error('[Popup] 匯入失敗:', err);
    showToast('匯入失敗：' + (err.message || '檔案格式錯誤'));
  }
}
function parseJsEmbedFile(content) {
  const articles = [];
  const jsonArrayMatch = content.match(/(?:const\s+)?posts\s*=\s*(\[[\s\S]*?\]);?\s*$/);
  if (jsonArrayMatch) {
    try {
      const jsonData = JSON.parse(jsonArrayMatch[1]);
      if (Array.isArray(jsonData) && jsonData.length > 0) {
        if (jsonData[0].timestamp !== undefined || jsonData[0].postLink !== undefined) {
          console.log('[Popup] 識別為完整資料格式');
          return jsonData.map(item => {
            let fullEmbedCode = item.embedCode || '';
            if (fullEmbedCode && !fullEmbedCode.includes('<script')) {
              fullEmbedCode = fullEmbedCode + '\n<script async src="https://www.threads.com/embed.js"></script>';
            }
            return {
              id: item.id || `imported_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              content: item.content || '',
              codeBlocks: item.codeBlocks || [],
              codeCount: item.codeCount || 0,
              author: item.author || '',
              authorUrl: item.authorUrl || '',
              postLink: item.postLink || '',
              embedCode: fullEmbedCode,
              timestamp: item.timestamp || '',
              timestampTitle: item.timestampTitle || '',
              tags: item.tags || [],
              savedAt: item.savedAt || new Date().toISOString(),
              importedFrom: 'full-data-file'
            };
          });
        }
      }
    } catch (e) {
      console.log('[Popup] 不是 JSON 格式，嘗試解析簡易格式');
    }
  }
  const arrayMatch = content.match(/(?:const\s+)?posts\s*=\s*\[([\s\S]*?)\];/);
  if (arrayMatch) {
    const arrayContent = arrayMatch[1];
    const embedCodeRegex = /'((?:[^'\\]|\\.)*)'/g;
    let match;
    while ((match = embedCodeRegex.exec(arrayContent)) !== null) {
      let embedCode = match[1];
      embedCode = embedCode
        .replace(/\\'/g, "'")
        .replace(/\\\\/g, '\\');
      const linkMatch = embedCode.match(/data-text-post-permalink="([^"]+)"/);
      const postLink = linkMatch ? linkMatch[1] : '';
      if (postLink) {
        const usernameMatch = postLink.match(/threads\.(?:com)\/@([^\/]+)/);
        const username = usernameMatch ? `@${usernameMatch[1]}` : '匯入的文章';
        const fullEmbedCode = embedCode + '\n<script async src="https://www.threads.com/embed.js"></script>';
        articles.push({
          id: `imported_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          content: '',
          codeBlocks: [],
          codeCount: 0,
          author: username,
          authorUrl: usernameMatch ? `https://www.threads.com/@${usernameMatch[1]}` : '',
          postLink: postLink,
          embedCode: fullEmbedCode,
          timestamp: new Date().toISOString(),
          tags: [],
          savedAt: new Date().toISOString(),
          importedFrom: 'js-embed-file'
        });
      }
    }
  }
  return articles;
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
  showToast('已清除所有文章');
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