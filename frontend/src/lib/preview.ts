export function previewDocument(html: string, answer: string, mode: string) {
  const safeAnswer = answer.replace(/<\/style/gi, '<\\/style')
  const css = mode === 'selector'
    ? `${safeAnswer} { outline: 4px solid #9b87ff !important; background: #372f5d !important; }`
    : `[data-preview] { ${safeAnswer} }`
  return `<!doctype html><html><head><style>
    :root{color-scheme:dark}
    *:not([data-preview]){box-sizing:border-box}
    body{margin:0;padding:24px;font:15px/1.5 system-ui;color:#e8e3f0;background:#121017}
    :where([data-preview],.demo,.flex-box,.grid-box){padding:18px;border:1px dashed #5c5668;border-radius:12px;background:#1b1822}
    :where(.flex-box span,.grid-box span){display:inline-block;padding:10px;margin:3px;background:#25212e;border:1px solid #403a49;border-radius:8px}
    input,button,select,textarea{color:#eee;background:#25212e;border:1px solid #4a4454;border-radius:6px;padding:8px}
    a{color:#ad9cff}
    ${css}
  </style></head><body>${html}</body></html>`
}

export function previewHtmlDocument(answer: string) {
  return `<!doctype html><html><head>
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:">
    <style>
      :root{color-scheme:dark}
      *{box-sizing:border-box}
      body{margin:0;padding:24px;font:15px/1.6 system-ui;color:#e8e3f0;background:#121017}
      :where(main,header,nav,section,article,aside,footer,form,fieldset,figure,table,details){
        display:block;margin:8px 0;padding:12px;border:1px dashed #4d4659;border-radius:8px
      }
      input,button,select,textarea{color:#eee;background:#25212e;border:1px solid #4a4454;border-radius:6px;padding:8px}
      a{color:#ad9cff} img{max-width:100%} table{border-collapse:collapse} th,td{border:1px solid #4a4454;padding:7px}
    </style>
  </head><body>${answer}</body></html>`
}
