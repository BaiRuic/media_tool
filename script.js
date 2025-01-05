// 首先检查浏览器支持
if (!checkBrowserSupport()) {
    console.error('浏览器不支持所需特性');
}

const threadInfo = document.querySelector('.thread-info');
const maxThreads = Math.min(navigator.hardwareConcurrency || 2, 12);
document.getElementById('threadCount').max = maxThreads;

// 使用配置创建 FFmpeg 实例
const { createFFmpeg } = FFmpeg;
const ffmpeg = createFFmpeg({
    log: true,
    threads: 4,
    progress: ({ ratio }) => {
        if (ratio && !isNaN(ratio)) {
            updateCurrentFileProgress(ratio);
        }
    }
});

const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const convertBtn = document.getElementById('convertBtn');
const selectedFilesDiv = document.getElementById('selectedFiles');
let selectedFiles = new Map(); // 使用Map存储文件和其状态

// 初始化 FFmpeg
(async function() {
    try {
        await ffmpeg.load();
        console.log('FFmpeg 加载成功');
        threadInfo.textContent = `多线程已启用: 最大支持 ${maxThreads} 个线程`;
        threadInfo.className = 'mt-3 alert alert-success';
    } catch (err) {
        console.error('FFmpeg 加载失败:', err);
        alert('FFmpeg 加载失败，请刷新页面重试');
        threadInfo.textContent = '多线程初始化失败';
        threadInfo.className = 'mt-3 alert alert-danger';
    }
})();

// 更新当前文件的进度
function updateCurrentFileProgress(ratio) {
    const currentFile = document.querySelector('.file-item.converting');
    if (currentFile) {
        const progress = currentFile.querySelector('.progress-bg');
        const percentage = Math.round(ratio * 100);
        progress.style.width = `${percentage}%`;
        currentFile.querySelector('.progress-text').textContent = `${percentage}%`;
    }
}

// 创建文件项
function createFileItem(file) {
    const div = document.createElement('div');
    div.className = 'file-item';
    div.dataset.fileName = file.name;
    div.innerHTML = `
        <div class="progress-bg"></div>
        <span class="file-name">${file.name}</span>
        <span class="progress-text">等待转换</span>
        <button class="delete-btn" onclick="removeFile('${file.name}')">×</button>
    `;
    return div;
}

// 移除文件
window.removeFile = function(fileName) {
    selectedFiles.delete(fileName);
    document.querySelector(`[data-file-name="${fileName}"]`).remove();
    updateConvertButton();
}

// 更新转换按钮状态
function updateConvertButton() {
    convertBtn.disabled = selectedFiles.size === 0;
}

// 处理文件选择
function handleFileSelect(files) {
    for (const file of files) {
        if (file.type.startsWith('video/')) {
            selectedFiles.set(file.name, file);
            selectedFilesDiv.appendChild(createFileItem(file));
        }
    }
    updateConvertButton();
}

fileInput.addEventListener('change', (e) => handleFileSelect(e.target.files));

// 处理拖拽
dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.style.borderColor = '#0d6efd';
});

dropZone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.style.borderColor = '#6c757d';
});

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.style.borderColor = '#6c757d';
    handleFileSelect(e.dataTransfer.files);
});

// 转换单个文件
async function convertFile(file, options) {
    const fileItem = document.querySelector(`[data-file-name="${file.name}"]`);
    fileItem.classList.add('converting');
    
    try {
        const data = await file.arrayBuffer();
        ffmpeg.FS('writeFile', 'input', new Uint8Array(data));

        let ffmpegArgs = ['-i', 'input'];
        
        // 设置编码器和基本参数
        ffmpegArgs.push('-c:v', options.encoder);
        
        // 设置线程
        ffmpegArgs.push(
            '-threads', String(options.threads),
            '-thread_type', 'frame',
            '-row-mt', '1'
        );

        // 如果是 x264/x265 编码器，添加特定参数
        if (options.encoder === 'libx264' || options.encoder === 'libx265') {
            ffmpegArgs.push(
                '-x264-params', `threads=${options.threads}`,
                '-preset', options.preset
            );
        }
        // 如果是 VP9，添加特定参数
        else if (options.encoder === 'libvpx-vp9') {
            ffmpegArgs.push(
                '-speed', '2',
                '-tile-columns', '2',
                '-frame-parallel', '1'
            );
        }

        // 设置视频质量/比特率
        if (options.videoBitrate === '0') {
            // 使用 CRF
            if (options.encoder === 'libvpx-vp9') {
                ffmpegArgs.push('-crf', options.quality, '-b:v', '0');
            } else {
                ffmpegArgs.push('-crf', options.quality);
            }
        } else {
            // 使用指定比特率
            ffmpegArgs.push('-b:v', options.videoBitrate);
        }

        // 设置分辨率
        if (options.resolution !== '0') {
            ffmpegArgs.push('-vf', `scale=${options.resolution}`);
        }

        // 设置音频编码和比特率
        if (options.format === 'webm') {
            ffmpegArgs.push('-c:a', 'libvorbis');
        } else {
            ffmpegArgs.push('-c:a', 'aac');
        }
        ffmpegArgs.push('-b:a', options.audioBitrate);

        // 优化输出
        if (options.format === 'mp4' || options.format === 'mov') {
            ffmpegArgs.push('-movflags', '+faststart');
        }

        // 生成输出文件路径 - 在原始文件所在目录
        const originalPath = file.path || file.name;
        const outputFileName = `${file.name.split('.')[0]}_converted.${options.format}`;
        const outputPath = originalPath.replace(file.name, outputFileName);
        
        ffmpegArgs.push(outputPath);

        console.log('FFmpeg 命令:', ffmpegArgs.join(' ')); // 输出完整命令以便调试

        try {
            await ffmpeg.run(...ffmpegArgs);
            
            // 清理
            ffmpeg.FS('unlink', 'input');

            fileItem.classList.remove('converting');
            fileItem.classList.add('converted');
            fileItem.querySelector('.progress-text').textContent = '转换完成';
            
            // 显示成功消息
            const successMsg = document.createElement('div');
            successMsg.className = 'success-message';
            successMsg.textContent = `文件已保存至: ${outputPath}`;
            fileItem.appendChild(successMsg);
        } catch (error) {
            console.error('转换过程出错:', error);
            fileItem.classList.remove('converting');
            fileItem.classList.add('error');
            fileItem.querySelector('.progress-text').textContent = '转换失败';
        }
    } catch (error) {
        console.error('转换错误:', error);
        fileItem.classList.remove('converting');
        fileItem.classList.add('error');
        fileItem.querySelector('.progress-text').textContent = '转换失败';
    }
}

// 转换按钮点击事件
convertBtn.addEventListener('click', async () => {
    const options = {
        format: document.getElementById('formatSelect').value,
        encoder: document.getElementById('encoderSelect').value,
        preset: document.getElementById('presetSelect').value,
        quality: document.getElementById('qualitySelect').value,
        threads: parseInt(document.getElementById('threadCount').value) || 4,
        videoBitrate: document.getElementById('videoBitrate').value,
        audioBitrate: document.getElementById('audioBitrate').value,
        resolution: document.getElementById('resolution').value
    };

    convertBtn.disabled = true;

    // 依次转换每个文件
    for (const [_, file] of selectedFiles) {
        await convertFile(file, options);
    }

    convertBtn.disabled = false;
});

// 格式改变时更新编码器选项
document.getElementById('formatSelect').addEventListener('change', function(e) {
    const encoder = document.getElementById('encoderSelect');
    const format = e.target.value;
    
    // 根据格式设置可用的编码器
    switch(format) {
        case 'webm':
            encoder.innerHTML = `
                <option value="libvpx-vp9">VP9 (推荐)</option>
                <option value="libvpx">VP8</option>
            `;
            break;
        case 'mp4':
        case 'mov':
        case 'mkv':
            encoder.innerHTML = `
                <option value="libx264">H.264 (通用)</option>
                <option value="libx265">H.265/HEVC (高压缩率)</option>
            `;
            break;
        case 'avi':
            encoder.innerHTML = `
                <option value="mpeg4">MPEG-4</option>
                <option value="libx264">H.264</option>
            `;
            break;
        case 'flv':
            encoder.innerHTML = `
                <option value="libx264">H.264</option>
            `;
            break;
        case 'wmv':
            encoder.innerHTML = `
                <option value="wmv2">WMV2</option>
                <option value="wmv1">WMV1</option>
            `;
            break;
        default:
            encoder.innerHTML = `
                <option value="libx264">H.264 (通用)</option>
            `;
    }
});

// 浏览器支持检查函数
function checkBrowserSupport() {
    // 检查浏览器是否支持必要的特性
    // 例如，检查是否支持 WebAssembly、Web Workers 等
    // 这里可以根据实际需求添加更多的检查
    return (
        typeof WebAssembly !== 'undefined' &&
        typeof Worker !== 'undefined' &&
        typeof navigator.hardwareConcurrency !== 'undefined'
    );
}
