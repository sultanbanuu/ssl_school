const styleId = "ssl-input-focus";

if (typeof document !== "undefined" && !document.getElementById(styleId)) {
  const style = document.createElement("style");
  style.id = styleId;
  style.textContent = `
    input:focus, textarea:focus, select:focus {
      outline: 2px solid #f5f5f3 !important;
      outline-offset: 2px !important;
    }
  `;
  document.head.appendChild(style);
}

export {};
