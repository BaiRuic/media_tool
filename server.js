const express = require('express');
const path = require('path');
const app = express();

// 设置安全相关的响应头
app.use((req, res, next) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    next();
});

// 提供静态文件
app.use(express.static(__dirname));

const port = 3001;
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
