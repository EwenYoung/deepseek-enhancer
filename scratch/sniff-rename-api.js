// 粘贴到 chat.deepseek.com 控制台执行
// 然后手动重命名一个会话，观察控制台输出

(function() {
  // hook fetch
  const origFetch = window.fetch;
  window.fetch = function(...args) {
    const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
    if (url.includes('chat_session') || url.includes('rename') || url.includes('update')) {
      console.group('%c[SNIFF] fetch', 'color:#f5a623;font-weight:bold');
      console.log('url:', args[0]);
      console.log('method:', args[1]?.method || 'GET');
      console.log('headers:', args[1]?.headers);
      if (args[1]?.body) {
        try { console.log('body:', JSON.parse(typeof args[1].body === 'string' ? args[1].body : '')); }
        catch { console.log('body(raw):', args[1].body); }
      }
      return origFetch.apply(this, args).then(r => {
        r.clone().text().then(t => {
          try { console.log('response:', JSON.parse(t)); } catch { console.log('response(raw):', t); }
          console.groupEnd();
        });
        return r;
      });
    }
    return origFetch.apply(this, args);
  };

  // hook XHR
  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function(method, url) {
    this.__ds_url = url;
    this.__ds_method = method;
    return origOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function(body) {
    if (this.__ds_url && (this.__ds_url.includes('chat_session') || this.__ds_url.includes('rename') || this.__ds_url.includes('update'))) {
      console.group('%c[SNIFF] XHR', 'color:#f5a623;font-weight:bold');
      console.log('url:', this.__ds_url);
      console.log('method:', this.__ds_method);
      if (body) {
        try { console.log('body:', JSON.parse(typeof body === 'string' ? body : '')); } catch { console.log('body(raw):', body); }
      }
      this.addEventListener('load', function() {
        try { console.log('response:', JSON.parse(this.responseText)); } catch { console.log('response(raw):', this.responseText); }
        console.groupEnd();
      });
    }
    return origSend.apply(this, arguments);
  };

  console.log('[SNIFF] Ready. 现在手动重命名一个会话，观察这里输出。');
})();
