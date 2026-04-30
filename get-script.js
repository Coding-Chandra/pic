document.addEventListener('DOMContentLoaded', () => {
    const gallery = document.getElementById('photoGallery');
    const loadingMessage = document.getElementById('loadingMessage');
    const errorMessage = document.getElementById('errorMessage');
    const emptyGallery = document.getElementById('emptyGallery');
    const searchBar = document.getElementById('searchBar');
    const sortSelect = document.getElementById('sortSelect');
    const categoryFilter = document.getElementById('categoryFilter');
    const authButton = document.getElementById('authButton');
    const pagination = document.getElementById('pagination');
    const prevPage = document.getElementById('prevPage');
    const nextPage = document.getElementById('nextPage');
    const pageInfo = document.getElementById('pageInfo');

    let allImages = [];
    let filteredImages = [];
    let activeTags = new Set();
    let currentUser = netlifyIdentity.currentUser();
    let currentPage = 1;
    const imagesPerPage = 12;
    const majorTags = ['Wallpaper', 'Nature', 'Travel', 'Street Peak'];

    // Sync user state and update auth button
    function syncUserState(user) {
        currentUser = user;
        if (user) {
            localStorage.setItem('netlifyUser', JSON.stringify({ id: user.id, email: user.email, role: user.app_metadata?.roles?.[0] }));
            const role = user.app_metadata?.roles?.includes('dashboard') ? 'Admin' : 'User';
            authButton.textContent = role;
            authButton.onclick = () => {
                window.location.href = 'dashboard.html';
            };
        } else {
            localStorage.removeItem('netlifyUser');
            authButton.textContent = '👤';
            authButton.onclick = () => {
                netlifyIdentity.open();
            };
        }
        updateGallery();
    }

    window.addEventListener('load', () => {
        document.getElementById('preloader').classList.add('fade-out');
    });

    function formatTitle(title) {
        if (!title) return 'Untitled';
        const cleanTitle = title.split('/').pop().replace(/-\d{13}$/, '');
        return cleanTitle
            .split('-')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    }

    async function fetchImages(userId = null) {
        try {
            loadingMessage.style.display = 'block';
            gallery.style.display = 'none';
            errorMessage.style.display = 'none';
            emptyGallery.style.display = 'none';

            const url = userId ? `/.netlify/functions/get-images?userId=${userId}&t=${Date.now()}` : `/.netlify/functions/get-images?t=${Date.now()}`;
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Fetch failed: ${response.statusText}`);

            const data = await response.json();
            console.log('Raw fetched data:', JSON.stringify(data, null, 2));

            let images = Array.isArray(data) ? data : (data.images || []);
            if (!Array.isArray(images)) {
                throw new Error(`Expected data.images to be an array, got: ${JSON.stringify(data.images)}`);
            }

            allImages = images;
            filteredImages = [...allImages];
            if (allImages.length === 0) {
                emptyGallery.style.display = 'block';
                gallery.style.display = 'none';
                pagination.style.display = 'none';
                loadingMessage.style.display = 'none';
            } else {
                renderGallery();
                renderCategoryFilter();
            }
        } catch (error) {
            console.error('Error fetching images:', error);
            errorMessage.textContent = `Error: ${error.message}`;
            errorMessage.style.display = 'block';
            loadingMessage.style.display = 'none';
            emptyGallery.style.display = 'none';
        }
    }

    function renderGallery() {
        loadingMessage.style.display = 'none';
        errorMessage.style.display = 'none';

        if (filteredImages.length === 0) {
            emptyGallery.style.display = 'block';
            gallery.style.display = 'none';
            pagination.style.display = 'none';
            return;
        }

        emptyGallery.style.display = 'none';
        gallery.style.display = 'grid';
        const startIdx = (currentPage - 1) * imagesPerPage;
        const endIdx = startIdx + imagesPerPage;
        const paginatedImages = filteredImages.slice(startIdx, endIdx);

        gallery.innerHTML = paginatedImages.map(image => {
            const displayTitle = formatTitle(image.title);
            const thumbnailUrl = image.url.replace(/upload\/v\d+/, 'upload/w_600,h_500,q_90,c_thumb');
            return `
                <div class="photo-card" onclick="window.location.href='photo.html?id=${encodeURIComponent(image.id)}'">
                    <div class="image-wrapper">
                        <img src="${thumbnailUrl}" alt="${displayTitle}" loading="lazy">
                    </div>
                    <div class="photo-info">
                        <h3>${displayTitle}</h3>
                        <input type="hidden" class="original-title" value="${displayTitle}">
                    </div>
                </div>
            `;
        }).join('');

        pagination.style.display = filteredImages.length > imagesPerPage ? 'flex' : 'none';
        prevPage.disabled = currentPage === 1;
        nextPage.disabled = endIdx >= filteredImages.length;
        pageInfo.textContent = `Page ${currentPage} of ${Math.ceil(filteredImages.length / imagesPerPage) || 1}`;

        document.querySelectorAll('.photo-card img').forEach(img => {
            img.addEventListener('contextmenu', e => e.preventDefault());
            img.addEventListener('dragstart', e => e.preventDefault());
        });
    }

    function renderCategoryFilter() {
        categoryFilter.innerHTML = majorTags.map(tag => `
            <button class="filter-btn${activeTags.has(tag) ? ' active' : ''}" data-tag="${tag}">${tag}</button>
        `).join('');

        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const tag = btn.dataset.tag;
                if (activeTags.has(tag)) {
                    activeTags.delete(tag);
                    btn.classList.remove('active');
                } else {
                    activeTags.add(tag);
                    btn.classList.add('active');
                }
                currentPage = 1;
                updateGallery();
            });
        });
    }


    function sortImages(images, sortBy) {
        const sorted = [...images];
        switch (sortBy) {
            case 'new-to-old':
                return sorted.sort((a, b) => new Date(b.date) - new Date(a.date));
            case 'old-to-new':
                return sorted.sort((a, b) => new Date(a.date) - new Date(a.date));
            case 'most-downloaded':
                return sorted.sort((a, b) => (b.downloads || 0) - (a.downloads || 0));
            case 'shuffled':
                return sorted.sort(() => Math.random() - 0.5);
            default:
                return sorted;
        }
    }

    function updateGallery() {
        filteredImages = [...allImages];
        const searchTerm = searchBar.value.toLowerCase().trim();
        if (searchTerm) {
            filteredImages = filteredImages.filter(image =>
                formatTitle(image.title).toLowerCase().includes(searchTerm) ||
                (image.description || '').toLowerCase().includes(searchTerm) ||
                (image.tags || []).some(tag => tag.toLowerCase().includes(searchTerm))
            );
        }

        if (activeTags.size > 0) {
            filteredImages = filteredImages.filter(image =>
                [...activeTags].every(tag => (image.tags || []).includes(tag))
            );
        }

        const sortBy = sortSelect.value;
        filteredImages = sortImages(filteredImages, sortBy);
        currentPage = 1;
        renderGallery();
    }

    // Auth Handling
    netlifyIdentity.on('init', user => {
        syncUserState(user || netlifyIdentity.currentUser());
    });

    netlifyIdentity.on('login', user => {
        syncUserState(user);
    });

    netlifyIdentity.on('logout', () => {
        syncUserState(null);
    });

    // Initial state check
    if (currentUser) {
        syncUserState(currentUser);
    } else {
        const storedUser = localStorage.getItem('netlifyUser');
        if (storedUser) {
            const userData = JSON.parse(storedUser);
            currentUser = { id: userData.id, email: userData.email, app_metadata: { roles: [userData.role] } };
            syncUserState(currentUser);
        } else {
            syncUserState(null);
        }
    }

    // Pagination and Event Listeners
    prevPage.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            renderGallery();
        }
    });

    nextPage.addEventListener('click', () => {
        const totalPages = Math.ceil(filteredImages.length / imagesPerPage);
        if (currentPage < totalPages) {
            currentPage++;
            renderGallery();
        }
    });

    searchBar.addEventListener('input', updateGallery);
    sortSelect.addEventListener('change', updateGallery);
    

    // Initial Fetch
    fetchImages(currentUser ? currentUser.id : null);
});