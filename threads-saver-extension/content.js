// Threads 文章儲存器 - Content Script

// 防止重複初始化
if (!window.__threadsSaverInitialized) {
  window.__threadsSaverInitialized = true;
  // 等待頁面載入
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}

// 安全檢查：擴充功能是否仍然有效
function isExtensionAlive() {
  try {
    return typeof chrome !== 'undefined' && !!chrome.runtime && !!chrome.runtime.id;
  } catch (_) {
    return false;
  }
}

// 包裝 storage.get，避免 Extension context invalidated 錯誤
async function safeStorageGet(keys) {
  if (!isExtensionAlive()) return {};
  try {
    return await chrome.storage.local.get(keys);
  } catch (err) {
    if (String(err).includes('Extension context invalidated')) {
      console.warn('[Threads Saver] 擴充功能內容被重新載入，忽略本次讀取');
      return {};
    }
    throw err;
  }
}

// 包裝 storage.set
async function safeStorageSet(obj) {
  if (!isExtensionAlive()) return;
  try {
    await chrome.storage.local.set(obj);
  } catch (err) {
    if (String(err).includes('Extension context invalidated')) {
      console.warn('[Threads Saver] 擴充功能內容被重新載入，忽略本次寫入');
      return;
    }
    throw err;
  }
}

function init() {
  console.log('[Threads Saver] 插件初始化');
  
  // 使用 MutationObserver 監聽動態加載的內容
  const observer = new MutationObserver((mutations) => {
    addSaveButtons();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  // 初始添加按鈕（延遲確保頁面載入完成）
  setTimeout(() => {
    addSaveButtons();
  }, 1000);
  
  // 定期檢查（每5秒）
  window.__threadsSaverIntervalId = window.__threadsSaverIntervalId || setInterval(() => {
    addSaveButtons();
  }, 5000);
}

function addSaveButtons() {
  // Threads 使用複雜的 div 結構，透過包含貼文連結來識別貼文
  // 策略：找到所有「取得內嵌程式碼」的選單項目，並在其旁邊添加我們的儲存按鈕
  
  // 方案 1：找所有包含「取得內嵌程式碼」文字的按鈕
  const embedButtons = Array.from(document.querySelectorAll('[role="button"]')).filter(btn => {
    const text = btn.textContent || '';
    return text.includes('取得內嵌程式碼') || text.includes('Get embed code');
  });
  
  console.log(`[Threads Saver] 找到 ${embedButtons.length} 個「取得內嵌程式碼」按鈕`);
  
  embedButtons.forEach((embedButton) => {
    // 檢查是否已經添加過監聽器
    if (embedButton.dataset.threadsSaverAttached) return;
    embedButton.dataset.threadsSaverAttached = 'true';
    
    // 攔截點擊事件
    embedButton.addEventListener('click', async (e) => {
      console.log('[Threads Saver] 偵測到「取得內嵌程式碼」被點擊');
      
      // 找到當前貼文的連結
      // 往上找到包含貼文連結的容器
      let container = embedButton;
      let postLink = null;
      
      for (let i = 0; i < 15 && container; i++) {
        container = container.parentElement;
        if (container) {
          const link = container.querySelector('a[href*="/post/"]');
          if (link) {
            postLink = link.href;
            break;
          }
        }
      }
      
      if (postLink) {
        console.log('[Threads Saver] 找到貼文連結:', postLink);
        
        // 等待一下讓嵌入程式碼顯示出來
        setTimeout(async () => {
          // 嘗試從頁面上找到嵌入程式碼的輸入框
          const embedInput = document.querySelector('input[readonly][value*="blockquote"]');
          let embedCode = null;
          
          if (embedInput) {
            embedCode = embedInput.value;
            console.log('[Threads Saver] 從輸入框取得內嵌程式碼');
          } else {
            // 備用方案：自己生成
            embedCode = buildThreadsEmbedCode(postLink);
            console.log('[Threads Saver] 自行生成內嵌程式碼');
          }
          
          // 儲存資料
          const articleData = {
            id: `embed_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            postLink: postLink,
            embedCode: embedCode,
            savedAt: new Date().toISOString(),
            content: '', // 可選：提取貼文內容
            author: '', // 可選：提取作者
            tags: [],
            codeBlocks: [],
            images: []
          };
          
          await saveArticle(articleData, null);
        }, 500);
      }
    }, true); // 使用捕獲階段以確保我們的處理器先執行
    
    console.log('[Threads Saver] 已附加監聽器到「取得內嵌程式碼」按鈕');
  });
}

function createSaveButton(articleElement) {
  const button = document.createElement('button');
  button.className = 'threads-save-btn x1i10hfl x1qjc9v5 xjbqb8w xjqpnuy xa49m3k xqeqjp1 x1phubyo x13fuv20 x18b5jzi x1q0q8m5 x1t7ytsu x972fbf xcfux6l x1qhh985 xm0m39n x9f619 x1ypdohk xdl72j9 x2lah0s x3ct3a4 xdj266r x14z9mp xat24cr x1lziwak x2lwn1j xeuugli xexx8yu x4uap5 x18d9i69 xkhd6sd x1n2onr6 x16tdsg8 x1hl2dhg xggy1nq x1ja2u2z x1t137rt';
  button.setAttribute('role', 'button');
  button.setAttribute('tabindex', '0');
  button.setAttribute('aria-label', '儲存內嵌程式碼');
  button.setAttribute('title', '儲存此貼文的內嵌程式碼');
  
  // 使用與 Threads 分享按鈕相同的結構
  button.innerHTML = `
    <div class="x6s0dn4 x15dp1bm x1pg3x37 xqi6p0a x102ru31 x78zum5 xl56j7k x1n2onr6 x3oybdh xx6bhzk x12w9bfk x11xpdln xc9qbxq x1g0dm76 xpdmqnj x14atkfc">
      <div class="x6s0dn4 x17zd0t2 x78zum5 xl56j7k">
        <svg aria-label="儲存" role="img" viewBox="0 0 24 24" class="x1lliihq x2lah0s x1n2onr6 x16ye13r x5lhr3w x1i0azm7 xbh8q5q x73je2i x1f6yumg xvlca1e" style="--x-fill: currentColor; --x-height: 18px; --x-width: 18px;">
          <title>儲存</title>
          <path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z" stroke="currentColor" stroke-width="1.5" fill="none"/>
        </svg>
      </div>
    </div>
  `;
  
  console.log('[Threads Saver] 創建儲存按鈕');
  
  button.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    console.log('[Threads Saver] 按鈕被點擊');

    const articleData = extractArticleData(articleElement);
    await saveArticle(articleData, button);
  });
  
  return button;
}

function extractArticleData(articleElement) {
  // 提取文章完整內容
  const textContent = articleElement.querySelector('[class*="x1lliihq"][class*="x1plvlek"]')?.innerText || 
                     articleElement.querySelector('span[class*="x193iq5w"]')?.innerText ||
                     articleElement.innerText;
  
  // 提取程式碼區塊（若存在則保留）
  const codeBlocks = extractCodeBlocks(articleElement, textContent);
  
  // 提取作者資訊
  const authorElement = articleElement.querySelector('a[role="link"]') ||
                       articleElement.querySelector('[class*="x1lliihq"] a');
  const author = authorElement?.innerText || '未知作者';
  const authorUrl = authorElement?.href || '';
  
  // 提取圖片（可能包含程式碼截圖）
  const images = Array.from(articleElement.querySelectorAll('img'))
    .map(img => img.src)
    .filter(src => src && !src.includes('avatar'));
  
  // 提取連結
  const postLink = articleElement.querySelector('a[href*="/post/"]')?.href || window.location.href;

  // 產生 Threads 內嵌程式碼（等同分享->取得內嵌程式碼）
  const embedCode = buildThreadsEmbedCode(postLink);
  
  // 提取時間
  const timeElement = articleElement.querySelector('time');
  const timestamp = timeElement?.getAttribute('datetime') || new Date().toISOString();
  
  // 提取標籤或語言（如果有）
  const tags = extractTags(textContent);
  
  return {
    id: `code_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    content: textContent.trim(),
    codeBlocks,
    codeCount: codeBlocks.length,
    author: author.trim(),
    authorUrl,
    images,
    postLink,
    embedCode,
    timestamp,
    tags,
    savedAt: new Date().toISOString()
  };
}

// 依據貼文連結生成 Threads 內嵌程式碼（官方格式）
function buildThreadsEmbedCode(postLink) {
  // Threads 官方嵌入語法 - 使用 text-post-media 格式
  if (!postLink) return '';
  
  // 從 URL 提取 permalink ID (例如 DRMxtAvkr5q)
  const match = postLink.match(/\/post\/([^\/\?]+)/);
  const postId = match ? match[1] : '';
  
  return (
    `<blockquote class="text-post-media" data-text-post-permalink="${postLink}" data-text-post-version="0" id="ig-tp-${postId}" style=" background:#FFF; border-width: 1px; border-style: solid; border-color: #00000026; border-radius: 16px; max-width:650px; margin: 1px; min-width:270px; padding:0; width:99.375%; width:-webkit-calc(100% - 2px); width:calc(100% - 2px);"> <a href="${postLink}" style=" background:#FFFFFF; line-height:0; padding:0 0; text-align:center; text-decoration:none; width:100%; font-family: -apple-system, BlinkMacSystemFont, sans-serif;" target="_blank"> <div style=" padding: 40px; display: flex; flex-direction: column; align-items: center;"><div style=" display:block; height:32px; width:32px; padding-bottom:20px;"> <svg aria-label="Threads" height="32px" role="img" viewBox="0 0 192 192" width="32px" xmlns="http://www.w3.org/2000/svg"> <path d="M141.537 88.9883C140.71 88.5919 139.87 88.2104 139.019 87.8451C137.537 60.5382 122.616 44.905 97.5619 44.745C97.4484 44.7443 97.3355 44.7443 97.222 44.7443C82.2364 44.7443 69.7731 51.1409 62.102 62.7807L75.881 72.2328C81.6116 63.5383 90.6052 61.6848 97.2286 61.6848C97.3051 61.6848 97.3819 61.6848 97.4576 61.6855C105.707 61.7381 111.932 64.1366 115.961 68.814C118.893 72.2193 120.854 76.925 121.825 82.8638C114.511 81.6207 106.601 81.2385 98.145 81.7233C74.3247 83.0954 59.0111 96.9879 60.0396 116.292C60.5615 126.084 65.4397 134.508 73.775 140.011C80.8224 144.663 89.899 146.938 99.3323 146.423C111.79 145.74 121.563 140.987 128.381 132.296C133.559 125.696 136.834 117.143 138.28 106.366C144.217 109.949 148.617 114.664 151.047 120.332C155.179 129.967 155.42 145.8 142.501 158.708C131.182 170.016 117.576 174.908 97.0135 175.059C74.2042 174.89 56.9538 167.575 45.7381 153.317C35.2355 139.966 29.8077 120.682 29.6052 96C29.8077 71.3178 35.2355 52.0336 45.7381 38.6827C56.9538 24.4249 74.2039 17.11 97.0132 16.9405C119.988 17.1113 137.539 24.4614 149.184 38.788C154.894 45.8136 159.199 54.6488 162.037 64.9503L178.184 60.6422C174.744 47.9622 169.331 37.0357 161.965 27.974C147.036 9.60668 125.202 0.195148 97.0695 0H96.9569C68.8816 0.19447 47.2921 9.6418 32.7883 28.0793C19.8819 44.4864 13.2244 67.3157 13.0007 95.9325L13 96L13.0007 96.0675C13.2244 124.684 19.8819 147.514 32.7883 163.921C47.2921 182.358 68.8816 191.806 96.9569 192H97.0695C122.03 191.827 139.624 185.292 154.118 170.811C173.081 151.866 172.51 128.119 166.26 113.541C161.776 103.087 153.227 94.5962 141.537 88.9883ZM98.4405 129.507C88.0005 130.095 77.1544 125.409 76.6196 115.372C76.2232 107.93 81.9158 99.626 99.0812 98.6368C101.047 98.5234 102.976 98.468 104.871 98.468C111.106 98.468 116.939 99.0737 122.242 100.233C120.264 124.935 108.662 128.946 98.4405 129.507Z" /></svg></div><div style=" font-size: 15px; line-height: 21px; color: #000000; font-weight: 600; "> 在 Threads 查看</div></div></a></blockquote>\n` +
    `<script async src="https://www.threads.com/embed.js"></script>`
  );
}

// 提取程式碼區塊
function extractCodeBlocks(articleElement, textContent) {
  const codeBlocks = [];
  
  // 方法 1: 查找 <pre> 和 <code> 標籤
  const preElements = articleElement.querySelectorAll('pre, code');
  preElements.forEach((element, index) => {
    const code = element.textContent.trim();
    if (code.length > 5) { // 過濾太短的內容
      codeBlocks.push({
        type: 'html_tag',
        code,
        language: detectLanguage(code),
        index: index + 1
      });
    }
  });
  
  // 方法 2: 使用正則提取 Markdown 風格的程式碼
  // 匹配 ```language\ncode\n``` 格式
  const markdownCodeRegex = /```(\w*)\n([\s\S]*?)```/g;
  let match;
  while ((match = markdownCodeRegex.exec(textContent)) !== null) {
    codeBlocks.push({
      type: 'markdown_block',
      code: match[2].trim(),
      language: match[1] || detectLanguage(match[2]),
      index: codeBlocks.length + 1
    });
  }
  
  // 方法 3: 提取行內程式碼 `code`
  const inlineCodeRegex = /`([^`\n]{2,})`/g;
  const inlineCodes = [];
  while ((match = inlineCodeRegex.exec(textContent)) !== null) {
    inlineCodes.push(match[1]);
  }
  
  if (inlineCodes.length > 0) {
    codeBlocks.push({
      type: 'inline',
      code: inlineCodes.join('\n'),
      language: 'mixed',
      count: inlineCodes.length,
      index: codeBlocks.length + 1
    });
  }
  
  // 方法 4: 查找等寬字體的元素
  const monoElements = articleElement.querySelectorAll('[style*="monospace"]');
  monoElements.forEach((element, index) => {
    const code = element.textContent.trim();
    if (code.length > 5 && !codeBlocks.some(block => block.code === code)) {
      codeBlocks.push({
        type: 'monospace',
        code,
        language: detectLanguage(code),
        index: codeBlocks.length + 1
      });
    }
  });
  
  return codeBlocks;
}

// 簡單的語言檢測
function detectLanguage(code) {
  const patterns = {
    javascript: /\b(const|let|var|function|=>|console\.log|async|await)\b/,
    python: /\b(def|import|from|class|if __name__|print\(|lambda)\b/,
    java: /\b(public|private|class|void|static|extends|implements)\b/,
    cpp: /\b(#include|iostream|std::|cout|cin|namespace)\b/,
    csharp: /\b(using|namespace|public|private|class|void|string)\b/,
    html: /<\/?[a-z][\s\S]*>/i,
    css: /\{[^}]*:[^}]*\}/,
    sql: /\b(SELECT|FROM|WHERE|INSERT|UPDATE|DELETE|CREATE|TABLE)\b/i,
    bash: /\b(echo|export|cd|ls|grep|awk|sed)\b/,
    json: /^\s*[\{\[].*[\}\]]\s*$/,
  };
  
  for (const [lang, pattern] of Object.entries(patterns)) {
    if (pattern.test(code)) {
      return lang;
    }
  }
  
  return 'unknown';
}

// 提取標籤
function extractTags(text) {
  const tags = [];
  
  // 提取 hashtags
  const hashtagRegex = /#([a-zA-Z0-9_\u4e00-\u9fa5]+)/g;
  let match;
  while ((match = hashtagRegex.exec(text)) !== null) {
    tags.push(match[1]);
  }
  
  // 檢測常見程式語言關鍵字
  const languages = ['JavaScript', 'Python', 'Java', 'C\\+\\+', 'C#', 'HTML', 'CSS', 'SQL', 'TypeScript', 'React', 'Vue', 'Angular'];
  languages.forEach(lang => {
    // 對於已經轉義的字串（如 C\+\+），直接使用；否則用 \b 包圍
    const pattern = lang.includes('\\') ? lang : `\\b${lang}\\b`;
    if (new RegExp(pattern, 'i').test(text)) {
      // 顯示時移除轉義字元
      tags.push(lang.replace(/\\\+/g, '+'));
    }
  });
  
  return [...new Set(tags)]; // 去重
}

async function saveArticle(articleData, button) {
  try {
    // 獲取現有的儲存文章
    const result = await safeStorageGet(['savedArticles']);
    const savedArticles = result.savedArticles || [];
    
    // 檢查是否已經儲存過
    const existingIndex = savedArticles.findIndex(
      article => article.postLink === articleData.postLink
    );
    
    if (existingIndex !== -1) {
      // 已經儲存過，更新它
      savedArticles[existingIndex] = articleData;
      await safeStorageSet({ savedArticles });
      
      if (button) {
        button.classList.add('saved');
      }
      showNotification('✅ 內嵌程式碼已更新');
    } else {
      // 新增儲存
      savedArticles.unshift(articleData);
      await safeStorageSet({ savedArticles });
      
      if (button) {
        button.classList.add('saved');
        button.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
            <path d="M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0l4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4z"/>
            <path d="M9 16.2L4.8 12l-1.4 1.4L9 19l13-13-1.4-1.4L9 16.2z" fill="#0095f6" opacity="0.3"/>
          </svg>
        `;
      }
      showNotification('✅ 內嵌程式碼已儲存');
    }
  } catch (error) {
    console.error('[Threads Saver] 儲存失敗:', error);
    showNotification('❌ 儲存失敗，請稍後再試');
  }
}

function showNotification(message) {
  const notification = document.createElement('div');
  notification.className = 'threads-save-notification';
  notification.textContent = message;
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.style.animation = 'slideIn 0.3s ease reverse';
    setTimeout(() => notification.remove(), 300);
  }, 2000);
}

// 檢查已儲存的文章並更新按鈕狀態
async function updateSavedButtonStates() {
  if (!isExtensionAlive()) return;
  const result = await safeStorageGet(['savedArticles']);
  const savedArticles = result.savedArticles || [];
  const savedLinks = savedArticles.map(article => article.postLink);
  
  document.querySelectorAll('.threads-save-btn').forEach(button => {
    const articleElement = button.closest('article') || 
                          button.closest('[role="article"]');
    if (!articleElement) return;
    
    const postLink = articleElement.querySelector('a[href*="/post/"]')?.href;
    if (savedLinks.includes(postLink)) {
      button.classList.add('saved');
      button.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
          <path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"/>
        </svg>
      `;
    }
  });
}

// 定期更新按鈕狀態
setInterval(updateSavedButtonStates, 2000);
