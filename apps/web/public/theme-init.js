try { document.documentElement.dataset.theme = localStorage.getItem("bf-theme") === "dark" ? "dark" : "light"; } catch (e) { document.documentElement.dataset.theme = "light"; }
// Navegador automatizado (testes): sem animações de entrada, para os cliques não pegarem os blocos em movimento.
try { if (navigator.webdriver) document.documentElement.dataset.motion = "off"; } catch (e) {}
