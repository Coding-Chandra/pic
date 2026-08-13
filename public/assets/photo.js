/**
 * PICLOAD Photo Page Script
 * Handles photo display, metadata, and download functionality on the photo.html page.
 */

let imagesData = [];

async function loadImages() {
    try {
        const response = await fetch('/.netlify/functions/get-images?t=' + Date.now());
        if (!response.ok) throw new Error(`Fetch failed: ${response.statusText}`);
        const data = await response.json();

        if (!data.images || !Array.isArray(data.images)) {
            throw new Error(`Expected data.images to be an array, got: ${JSON.stringify(data.images)}`);
        }

        imagesData = data.images; // URLs are decrypted server-side
        displayPhoto();
    } catch (error) {
        console.error('Error loading images:', error);
        document.getElementById('photoDetails').innerHTML = `
            <p>Error: ${error.message}. <a href="./index.html">Return to homepage</a></p>
        `;
    }
}

function cleanTitle(title) {
  return title
    .replace(/-\d{13}(\.jpg)?$/, '')        // Remove -timestamp and optional .jpg
    .replace(/\.[a-z]+$/, '')               // Remove any remaining file extension
    .replace(/[-_]+/g, ' ')                 // Replace dashes/underscores with space
    .replace(/\s+/g, ' ')                   // Normalize multiple spaces
    .trim()                                 // Remove leading/trailing whitespace
    .replace(/\b\w/g, c => c.toUpperCase()); // Capitalize first letter of each word
}

function displayPhoto() {
    const urlParams = new URLSearchParams(window.location.search);
    const photoId = urlParams.get('id');
    const image = imagesData.find(img => img.id === photoId);

    if (!image) {
        document.getElementById('photoDetails').innerHTML = `
            <p>Photo not found. <a href="./index.html">Return to homepage</a></p>
        `;
        return;
    }

    const img = new Image();
    img.src = image.url;
    img.onload = async () => {
        const photoImage = document.getElementById('photoImage');
        const clean = cleanTitle(image.title);
        photoImage.src = image.url;
        photoImage.alt = clean;
        document.getElementById('photoTitle').textContent = clean;
        document.getElementById('photoDescription').textContent = image.description || 'No description';

        const response = await fetch(image.url, { method: 'HEAD' });
        const fileSize = response.headers.get('content-length');
        document.getElementById('photoFileSize').textContent = fileSize ? `${(fileSize / (1024 * 1024)).toFixed(1)} MB` : 'Unknown';

        document.getElementById('photoResolution').textContent = `${img.width}x${img.height}`;
        document.getElementById('photoDownloads').textContent = image.downloads || 0;

        const tagsContainer = document.getElementById('photoTags');
        tagsContainer.innerHTML = image.tags?.length ? '' : '<span class="tag">No tags available</span>';
        image.tags?.forEach(tag => {
            const tagElement = document.createElement('span');
            tagElement.className = 'tag';
            tagElement.textContent = tag;
            tagsContainer.appendChild(tagElement);
        });

        // Dynamically filter resolution options based on image dimensions
        const select = document.getElementById('resolutionSelect');
        select.innerHTML = '<option value="original">Original Resolution</option>';
        const maxDim = Math.max(img.width, img.height);
        if (maxDim > 2400) select.innerHTML += '<option value="2400">Large (2400 x 1350)</option>';
        if (maxDim > 1920) select.innerHTML += '<option value="1920">Medium (1920 x 1080)</option>';
        if (maxDim > 640) select.innerHTML += '<option value="640">Small (640 x 360)</option>';

        document.getElementById('downloadBtn').onclick = () => downloadImage(image);
        displaySuggestions(image);
    };
    img.onerror = () => {
        document.getElementById('photoDetails').innerHTML = `
            <p>Error loading image. <a href="./index.html">Return to homepage</a></p>
        `;
    };
}

function displaySuggestions(currentImage) {
    const suggestionsGrid = document.getElementById('suggestionsGrid');
    const similarImages = imagesData
        .filter(img => img.id !== currentImage.id && img.tags?.some(tag => currentImage.tags?.includes(tag)))
        .sort(() => crypto.getRandomValues(new Uint32Array(1))[0] / 2**32 - 0.5)
        .slice(0, 15);

    suggestionsGrid.innerHTML = '';
    similarImages.forEach(image => {
    const card = document.createElement('div');
    card.className = 'suggestion-card';
    const thumbnailUrl = image.url.replace(/upload\/v\d+/, 'upload/w_200,h_150,q_79,c_thumb');
    const clean = cleanTitle(image.title);
    
    card.innerHTML = `
        <img src="${thumbnailUrl}" alt="${clean}" loading="lazy">
        <p>${clean}</p>
    `;
    
    card.addEventListener('click', () => {
        window.location.href = `./photo.html?id=${encodeURIComponent(image.id)}`;
    });

    suggestionsGrid.appendChild(card);
});

}

async function downloadImage(image) {
    const resolution = document.getElementById('resolutionSelect').value;
    let url = image.url;
    const img = new Image();
    img.src = image.url;

    await new Promise(resolve => img.onload = resolve);
    const isPortrait = img.height > img.width;
    const maxSize = resolution === 'original' ? null : parseInt(resolution);

    if (maxSize) {
        const transform = isPortrait ? `h_${maxSize},c_scale` : `w_${maxSize},c_scale`;
        url = `${image.url.replace(/upload\/v\d+/, `upload/${transform},q_70`)}`;
    }

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error('Failed to fetch image');
        const blob = await response.blob();
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `${image.title.replace(/-\d{13}$/, '')}-${resolution === 'original' ? 'original' : maxSize}px.jpg`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);

        const updateResponse = await fetch('/.netlify/functions/update-downloads', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ public_id: image.id })
        });
        if (!updateResponse.ok) throw new Error('Failed to update downloads');
        const updateData = await updateResponse.json();

        image.downloads = updateData.downloads;
        document.getElementById('photoDownloads').textContent = image.downloads;
    } catch (error) {
        console.error('Download failed:', error);
        alert('Failed to download image.');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    loadImages();

    const photoImage = document.getElementById('photoImage');
    photoImage.addEventListener('contextmenu', e => e.preventDefault());
    photoImage.addEventListener('dragstart', e => e.preventDefault());
    document.addEventListener('keydown', e => {
        if (e.key === 'PrintScreen') {
            e.preventDefault();
            alert('Screenshots are disabled on this page.');
        }
    });
});

// All Right Reserved. This code is provided as-is without warranty of any kind. Use at your own risk.
// Property of Picpool. Issued under the MIT License. See LICENSE file for details.