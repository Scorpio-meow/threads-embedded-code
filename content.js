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
  
  console.log('[Threads Saver] 準備處理', embedButtons.length, '個嵌入按鈕');
  
  embedButtons.forEach((embedButton, index) => {
    // 檢查是否已經添加過監聽器
    if (embedButton.dataset.threadsSaverAttached) {
      console.log(`[Threads Saver] 按鈕 ${index + 1} 已處理過,跳過`);
      return;
    }
    console.log(`[Threads Saver] 處理按鈕 ${index + 1}`);
    embedButton.dataset.threadsSaverAttached = 'true';
    
    // 攔截點擊事件
    embedButton.addEventListener('click', async (e) => {
      console.log('[Threads Saver] 偵測到「取得內嵌程式碼」被點擊');
      
      let preContent = '';
      let preAuthor = '';
      let preAuthorUrl = '';
      
      const postElement = embedButton.closest('article') || 
                         embedButton.closest('[role="article"]') ||
                         embedButton.closest('div[class*="x1lliihq"]');
      
      if (postElement) {
        console.log('[Threads Saver] 點擊前找到貼文容器元素');
        
        // 提取內容
        const contentSpan = postElement.querySelector('[class*="x1lliihq"][class*="x1plvlek"]') ||
                           postElement.querySelector('span[class*="x193iq5w"]');
        if (contentSpan) {
          preContent = contentSpan.innerText || '';
          console.log('[Threads Saver] 點擊前提取到內容長度:', preContent.length);
        }
        
        // 提取作者
        const authorLink = postElement.querySelector('a[role="link"][href*="/@"]');
        if (authorLink) {
          preAuthor = authorLink.innerText || '';
          preAuthorUrl = authorLink.href || '';
          console.log('[Threads Saver] 點擊前提取到作者:', preAuthor);
        }
      } else {
        console.log('[Threads Saver] 點擊前未找到貼文容器元素');
      }
      
      // 等待對話框顯示以取得官方內嵌程式碼
      setTimeout(async () => {
        let postLink = null;
        let embedCode = null;
        
        // 找到對話框
        const dialogs = document.querySelectorAll('[role="dialog"]');
        if (dialogs.length === 0) {
          console.error('[Threads Saver] 找不到對話框');
          showNotification('找不到內嵌程式碼對話框');
          return;
        }
        
        const dialog = dialogs[dialogs.length - 1];
        console.log('[Threads Saver] 找到', dialogs.length, '個對話框,使用最新的一個');
        
        // **關鍵:直接從內嵌程式碼的 data-text-post-permalink 提取網址**
        const embedInput = dialog.querySelector('input[readonly][value*="blockquote"]');
        if (embedInput) {
          embedCode = embedInput.value;
          console.log('[Threads Saver] 從對話框取得官方內嵌程式碼');
          
          // 從內嵌程式碼中提取 data-text-post-permalink 作為唯一可信來源
          const permalinkMatch = embedCode.match(/data-text-post-permalink="([^"]+)"/);
          if (permalinkMatch) {
            postLink = permalinkMatch[1];
            console.log('[Threads Saver] 從內嵌程式碼的 data-text-post-permalink 提取網址:', postLink);
          }
        } else {
          console.error('[Threads Saver] 找不到內嵌程式碼輸入框');
        }
        
        // 如果沒有成功提取到網址,無法儲存
        if (!postLink) {
          console.error('[Threads Saver] 無法從內嵌程式碼提取貼文連結');
          showNotification('無法取得貼文連結');
          return;
        }
        
        // 如果還沒有作者資訊,從網址提取
        let fallbackAuthor = '';
        let fallbackAuthorUrl = '';
        if (!preAuthor) {
          const authorMatch = postLink.match(/\/@([^\/]+)\//);
          if (authorMatch) {
            fallbackAuthor = authorMatch[1];
            fallbackAuthorUrl = `https://www.threads.net/@${fallbackAuthor}`;
            console.log('[Threads Saver] 從網址提取作者:', fallbackAuthor);
          }
        }
        
        // 如果沒有內嵌程式碼(理論上不會發生,因為我們是從輸入框取得的)
        if (!embedCode) {
          embedCode = buildThreadsEmbedCode(postLink);
          console.log('[Threads Saver] 自行生成內嵌程式碼');
        }
        
        // 使用點擊前預先抓取的資料,如果為空才使用 fallback
        let finalContent = preContent;
        let finalAuthor = preAuthor || fallbackAuthor;
        let finalAuthorUrl = preAuthorUrl || fallbackAuthorUrl;
        
        // Fallback: 只在預先抓取失敗時才嘗試透過 postLink 重新查找
        if (!finalContent && postLink) {
          console.log('[Threads Saver] 預抓取資料不完整,嘗試透過 postLink 查找...');
          const postId = postLink.match(/\/post\/([^\/\?]+)/)?.[1];
          if (postId) {
            // 嘗試找到包含此 postId 的連結所在的文章元素
            const postLinks = Array.from(document.querySelectorAll(`a[href*="/post/${postId}"]`));
            for (const link of postLinks) {
              const article = link.closest('article') || 
                             link.closest('[role="article"]') ||
                             link.closest('div[class*="x1lliihq"]');
              if (article) {
                console.log('[Threads Saver] 透過 postLink 找到文章元素');
                
                // 提取內容
                if (!finalContent) {
                  const contentSpan = article.querySelector('[class*="x1lliihq"][class*="x1plvlek"]') ||
                                     article.querySelector('span[class*="x193iq5w"]');
                  if (contentSpan) {
                    finalContent = contentSpan.innerText || '';
                    console.log('[Threads Saver] Fallback 提取到內容長度:', finalContent.length);
                  }
                }
                
                // 提取作者
                if (!finalAuthor) {
                  const authorLink = article.querySelector('a[role="link"][href*="/@"]');
                  if (authorLink) {
                    finalAuthor = authorLink.innerText || '';
                    finalAuthorUrl = authorLink.href || '';
                    console.log('[Threads Saver] Fallback 提取到作者:', finalAuthor);
                  }
                }
                
                break;
              }
            }
          }
        }
        
        console.log('[Threads Saver] 最終資料 - 內容長度:', finalContent.length);

        // 儲存資料
        const articleData = {
          id: `embed_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          postLink: postLink,
          embedCode: embedCode,
          savedAt: new Date().toISOString(),
          content: finalContent.trim(),
          author: finalAuthor.trim(),
          authorUrl: finalAuthorUrl,
          tags: extractTags(finalContent),
          codeBlocks: []
        };
        
        console.log('[Threads Saver] 準備儲存文章:', articleData.postLink);
        await saveArticle(articleData, null);
      }, 1000); // 設定為 1000ms 確保內嵌程式碼對話框完全載入
    }, true); // 使用捕獲階段以確保我們的處理器先執行
    
    console.log('[Threads Saver] 已附加監聽器到「取得內嵌程式碼」按鈕');
  });
}

function extractArticleData(articleElement) {
  // 提取文章完整內容
  const textContent = articleElement.querySelector('[class*="x1lliihq"][class*="x1plvlek"]')?.innerText || 
                     articleElement.querySelector('span[class*="x193iq5w"]')?.innerText ||
                     articleElement.innerText;
  
  // 提取程式碼區塊(若存在則保留)
  const codeBlocks = extractCodeBlocks(articleElement, textContent);
  
  // 提取作者資訊
  const authorElement = articleElement.querySelector('a[role="link"]') ||
                       articleElement.querySelector('[class*="x1lliihq"] a');
  const author = authorElement?.innerText || '未知作者';
  const authorUrl = authorElement?.href || '';
  
  // 提取連結
  const postLink = articleElement.querySelector('a[href*="/post/"]')?.href || window.location.href;

  // 直接使用本地生成的嵌入代碼（用戶可以稍後手動更新）
  const embedCode = buildThreadsEmbedCode(postLink);
  console.log('[Threads Saver] 使用本地生成的嵌入代碼（可稍後手動更新）');
  
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
    postLink,
    embedCode,
    timestamp,
    tags,
    savedAt: new Date().toISOString()
  };
}

// 依據貼文連結生成 Threads 內嵌程式碼(官方格式)
function buildThreadsEmbedCode(postLink) {
  // Threads 官方嵌入語法 - 使用完整版本
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
    console.log('[Threads Saver] ========== 開始儲存流程 ==========');
    console.log('[Threads Saver] 文章資料:', {
      postLink: articleData.postLink,
      author: articleData.author,
      contentLength: articleData.content?.length,
      codeBlocksCount: articleData.codeBlocks?.length
    });
    
    // 獲取現有的儲存文章
    const result = await safeStorageGet(['savedArticles']);
    const savedArticles = result.savedArticles || [];
    
    console.log('[Threads Saver] 目前已儲存文章數:', savedArticles.length);
    console.log('[Threads Saver] 準備儲存的文章連結:', articleData.postLink);
    
    // 檢查是否已經儲存過
    const existingIndex = savedArticles.findIndex(
      article => article.postLink === articleData.postLink
    );
    
    console.log('[Threads Saver] 檢查重複結果:', existingIndex !== -1 ? `已存在於索引 ${existingIndex}` : '新文章');
    
    if (existingIndex !== -1) {
      // 已經儲存過,更新它
      console.log('[Threads Saver] 文章已存在於索引', existingIndex, ',將更新');
      savedArticles[existingIndex] = articleData;
      console.log('[Threads Saver] 開始寫入更新...');
      await safeStorageSet({ savedArticles });
      console.log('[Threads Saver] 更新成功!');
      
      if (button) {
        button.classList.add('saved');
      }
      showNotification('內嵌程式碼已更新');
    } else {
      // 新增儲存
      console.log('[Threads Saver] 新文章,將新增到列表');
      console.log('[Threads Saver] 新增前文章數:', savedArticles.length);
      savedArticles.unshift(articleData);
      console.log('[Threads Saver] 新增後文章數:', savedArticles.length);
      console.log('[Threads Saver] 開始寫入儲存...');
      
      try {
        await safeStorageSet({ savedArticles });
        console.log('[Threads Saver] 儲存成功!現在總共有', savedArticles.length, '篇文章');
      } catch (saveError) {
        console.error('[Threads Saver] 寫入失敗:', saveError);
        throw saveError;
      }
      
      if (button) {
        button.classList.add('saved');
        button.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
            <path d="M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0l4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4z"/>
            <path d="M9 16.2L4.8 12l-1.4 1.4L9 19l13-13-1.4-1.4L9 16.2z" fill="#0095f6" opacity="0.3"/>
          </svg>
        `;
      }
      showNotification('內嵌程式碼已儲存');
    }
  } catch (error) {
    console.error('[Threads Saver] ========== 儲存失敗 ==========');
    console.error('[Threads Saver] 錯誤類型:', error.name);
    console.error('[Threads Saver] 錯誤訊息:', error.message);
    console.error('[Threads Saver] 完整錯誤:', error);
    
    // 檢查是否是儲存空間不足的錯誤
    if (error.message && (error.message.includes('QUOTA') || error.message.includes('quota'))) {
      console.error('[Threads Saver] 錯誤原因: 儲存空間配額已滿');
      showNotification('儲存空間已滿!請開啟擴充功能清理舊文章');
    } else if (error.message && error.message.includes('Extension context invalidated')) {
      console.error('[Threads Saver] 錯誤原因: 擴充功能已失效');
      showNotification('擴充功能已失效,請重新載入頁面');
    } else {
      console.error('[Threads Saver] 錯誤原因: 未知');
      showNotification('儲存失敗: ' + (error.message || '請稍後再試'));
    }
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
