try { document.documentElement.dataset.theme = localStorage.getItem("bf-theme") === "dark" ? "dark" : "light"; } catch (e) { document.documentElement.dataset.theme = "light"; }
