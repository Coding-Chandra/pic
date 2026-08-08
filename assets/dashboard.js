/**
 * PICLOADDashboard - final updated class
 * - brighter + blurred modal background
 * - tooltips for modal buttons (theme-matching popups)
 * - body scroll lock + image.onload handling
 * - stable modal (zoom, pan, pinch, swipe, keyboard)
 * - fixed delete flow
 * - paginated grid (6 photos/page) with animated page transitions
 */

class PICLOADDashboard {
    constructor() {
        this.currentUser = null;
        this.photos = [];
        this.selectedPhotoId = null;

        // Pagination state
        this.itemsPerPage = 6;
        this.currentPage = 1;

        this.init();
    }

    async init() {
        try {
            await this.waitForNetlifyIdentity();

            this.currentUser = netlifyIdentity.currentUser();

            if (!this.currentUser) {
                this.showNotAuthenticated();
                netlifyIdentity.on('login', (user) => {
                    this.currentUser = user;
                    location.reload();
                });
                return;
            }

            document.getElementById('authCheckMessage').classList.add('hidden');
            document.getElementById('dashboardContent').classList.remove('hidden');

            this.cacheElements();
            this.attachEventListeners();
            this.displayUserInfo();
            await this.loadUserPhotos();

            // initialize modal AFTER photos load
            this.initImageModal();

        } catch (error) {
            console.error('Dashboard initialization error:', error);
            this.showToast('Failed to initialize dashboard', 'error');
        }
    }

    waitForNetlifyIdentity() {
        return new Promise((resolve) => {
            let attempts = 0;
            const checkInterval = setInterval(() => {
                if (window.netlifyIdentity || ++attempts > 50) {
                    clearInterval(checkInterval);
                    resolve();
                }
            }, 100);
        });
    }

    cacheElements() {
        this.logoutBtn = document.getElementById('logoutBtn');
        this.userNameDisplay = document.getElementById('userNameDisplay');
        this.photoList = document.getElementById('photoList');
        this.emptyState = document.getElementById('emptyState');
        this.loadingState = document.getElementById('loadingState');
        this.paginationContainer = document.getElementById('paginationContainer');

        this.editModal = document.getElementById('editModal');
        this.editForm = document.getElementById('editForm');
        this.editPhotoTitle = document.getElementById('editPhotoTitle');
        this.editPhotoDescription = document.getElementById('editPhotoDescription');
        this.editCharCount = document.getElementById('editCharCount');
        this.closeEditModal = document.getElementById('closeEditModal');
        this.cancelEditBtn = document.getElementById('cancelEditBtn');
        this.saveEditBtn = document.getElementById('saveEditBtn');
        this.editMessage = document.getElementById('editMessage');
        this.editModalOverlay = document.getElementById('editModalOverlay');

        this.deleteModal = document.getElementById('deleteModal');
        this.cancelDeleteBtn = document.getElementById('cancelDeleteBtn');
        this.confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
        this.deleteModalOverlay = document.getElementById('deleteModalOverlay');

        this.toastContainer = document.getElementById('toastContainer');
    }

    attachEventListeners() {
        this.logoutBtn.addEventListener('click', () => this.logout());

        this.closeEditModal.addEventListener('click', () => this.closeEditModal_());
        this.editModalOverlay.addEventListener('click', () => this.closeEditModal_());
        this.cancelEditBtn.addEventListener('click', () => this.closeEditModal_());
        this.editForm.addEventListener('submit', (e) => this.handleEditSubmit(e));
        this.editPhotoDescription.addEventListener('input', (e) => this.updateEditCharCount(e));

        this.deleteModalOverlay.addEventListener('click', () => this.closeDeleteModal());
        this.cancelDeleteBtn.addEventListener('click', () => this.closeDeleteModal());
        this.confirmDeleteBtn.addEventListener('click', () => this.confirmDelete());

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeEditModal_();
                this.closeDeleteModal();
            }
        });
    }

    showNotAuthenticated() {
        document.getElementById('authCheckMessage').classList.add('hidden');
        document.getElementById('notAuthMessage').classList.remove('hidden');
    }

    displayUserInfo() {
        const email = this.currentUser.email;
        const name = this.currentUser.user_metadata?.full_name || email.split('@')[0];
        this.userNameDisplay.textContent = `Welcome, ${name}!`;
    }

    async loadUserPhotos() {
        try {
            this.loadingState.classList.remove('hidden');
            this.photoList.classList.add('hidden');
            this.emptyState.classList.add('hidden');
            if (this.paginationContainer) this.paginationContainer.classList.add('hidden');

            const userEmail = encodeURIComponent(this.currentUser.email);
            const response = await fetch(
                `/.netlify/functions/get-user-images?user_email=${userEmail}&t=${Date.now()}`
            );

            if (!response.ok) {
                throw new Error(`Failed to load photos: ${response.statusText}`);
            }

            const data = await response.json();
            this.photos = Array.isArray(data.images) ? data.images : [];
            this.currentPage = 1;

            console.log(`Loaded ${this.photos.length} photos for ${this.currentUser.email}`);

            if (this.photos.length === 0) {
                this.emptyState.classList.remove('hidden');
            } else {
                this.displayPhotos();
            }

        } catch (error) {
            console.error('Error loading photos:', error);
            this.showToast('Error loading photos: ' + error.message, 'error');
            this.emptyState.classList.remove('hidden');
        } finally {
            this.loadingState.classList.add('hidden');
        }
    }

    displayPhotos() {
        // If no photos, hide grid + pagination
        if (!Array.isArray(this.photos) || this.photos.length === 0) {
            this.photoList.classList.add('hidden');
            this.emptyState.classList.remove('hidden');
            if (this.paginationContainer) {
                this.paginationContainer.classList.add('hidden');
                this.paginationContainer.innerHTML = '';
            }
            return;
        }

        this.photoList.classList.remove('hidden');
        this.emptyState.classList.add('hidden');

        this._renderPage();
    }

    // Renders only the photos belonging to the current page (no animation —
    // used for initial load / after edit / after delete). Page navigation
    // goes through goToPage(), which wraps this with a transition.
    _renderPage() {
        const totalPages = Math.max(1, Math.ceil(this.photos.length / this.itemsPerPage));
        if (this.currentPage > totalPages) this.currentPage = totalPages;
        if (this.currentPage < 1) this.currentPage = 1;

        const startIdx = (this.currentPage - 1) * this.itemsPerPage;
        const pagePhotos = this.photos.slice(startIdx, startIdx + this.itemsPerPage);

        this.photoList.innerHTML = pagePhotos.map((photo, i) => {
            // idx is the photo's index in the FULL photos array so the
            // fullscreen modal can still page through every photo, not
            // just the ones on the current page.
            const idx = startIdx + i;
            return `
            <div class="photo-card pop-in" style="animation-delay:${i * 45}ms" data-id="${this.escapeHtml(photo.id)}" data-index="${idx}">
                <div class="photo-image-wrapper">
                    <img src="${this.escapeHtml(photo.url)}" alt="${this.escapeHtml(photo.title)}" loading="lazy">
                </div>
                <div class="photo-info">
                    <h3>${this.escapeHtml(photo.title)}</h3>
                    <p>${this.escapeHtml(photo.description || 'No description')}</p>
                </div>
                <div class="photo-actions">
                    <button class="btn-action btn-edit" data-id="${this.escapeHtml(photo.id)}" title="Edit">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn-action btn-delete" data-id="${this.escapeHtml(photo.id)}" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                    <button class="btn-action btn-view" data-id="${this.escapeHtml(photo.id)}" data-index="${idx}" title="View Full Size">
                        <i class="fas fa-external-link-alt"></i>
                    </button>
                </div>
            </div>
        `;
        }).join('');

        // Edit
        this.photoList.querySelectorAll('.btn-edit').forEach(btn => {
            btn.addEventListener('click', () => {
                const photoId = btn.dataset.id;
                this.openEditModal(photoId);
            });
        });

        // Delete
        this.photoList.querySelectorAll('.btn-delete').forEach(btn => {
            btn.addEventListener('click', () => {
                const photoId = btn.dataset.id;
                this.openDeleteModal(photoId);
            });
        });

        // View -> modal by global index (spans all pages)
        this.photoList.querySelectorAll('.btn-view').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = Number(btn.dataset.index);
                this.openImageModalByIndex(idx);
            });
        });

        this.renderPaginationControls(totalPages, startIdx);
    }

    renderPaginationControls(totalPages, startIdx) {
        if (!this.paginationContainer) return;

        if (totalPages <= 1) {
            this.paginationContainer.classList.add('hidden');
            this.paginationContainer.innerHTML = '';
            return;
        }

        this.paginationContainer.classList.remove('hidden');

        const rangeStart = startIdx + 1;
        const rangeEnd = Math.min(startIdx + this.itemsPerPage, this.photos.length);
        const pageNumbers = this._getPaginationRange(this.currentPage, totalPages);

        const pagesHtml = pageNumbers.map(p => {
            if (p === '...') return `<span class="pagination-ellipsis">&hellip;</span>`;
            return `<button class="pagination-page-btn ${p === this.currentPage ? 'active' : ''}" data-page="${p}">${p}</button>`;
        }).join('');

        this.paginationContainer.innerHTML = `
            <div class="pagination-info">${rangeStart}&ndash;${rangeEnd} of ${this.photos.length} photos</div>
            <div class="pagination-controls">
                <button class="pagination-nav-btn" id="paginationPrev" ${this.currentPage <= 1 ? 'disabled' : ''} aria-label="Previous page">
                    <i class="fas fa-chevron-left"></i>
                </button>
                <div class="pagination-pages">${pagesHtml}</div>
                <button class="pagination-nav-btn" id="paginationNext" ${this.currentPage >= totalPages ? 'disabled' : ''} aria-label="Next page">
                    <i class="fas fa-chevron-right"></i>
                </button>
            </div>
        `;

        document.getElementById('paginationPrev').addEventListener('click', () => this.goToPage(this.currentPage - 1));
        document.getElementById('paginationNext').addEventListener('click', () => this.goToPage(this.currentPage + 1));
        this.paginationContainer.querySelectorAll('.pagination-page-btn').forEach(btn => {
            btn.addEventListener('click', () => this.goToPage(Number(btn.dataset.page)));
        });
    }

    // Builds a compact page list with ellipses, e.g. [1, '...', 4, 5, 6, '...', 12]
    _getPaginationRange(current, total) {
        const delta = 1;
        const range = [];
        const rangeWithDots = [];
        let last = null;

        for (let i = 1; i <= total; i++) {
            if (i === 1 || i === total || (i >= current - delta && i <= current + delta)) {
                range.push(i);
            }
        }

        range.forEach(i => {
            if (last !== null) {
                if (i - last === 2) {
                    rangeWithDots.push(last + 1);
                } else if (i - last !== 1) {
                    rangeWithDots.push('...');
                }
            }
            rangeWithDots.push(i);
            last = i;
        });

        return rangeWithDots;
    }

    goToPage(newPage) {
        const totalPages = Math.max(1, Math.ceil(this.photos.length / this.itemsPerPage));
        newPage = Math.min(totalPages, Math.max(1, newPage));
        if (newPage === this.currentPage) return;

        const direction = newPage > this.currentPage ? 'forward' : 'back';
        this.currentPage = newPage;
        this._animatePageChange(direction);
    }

    // Slides the current page out, swaps the grid content, then slides
    // the new page in. Direction controls which way things travel so
    // "Next" feels like moving forward and "Prev" feels like moving back.
    _animatePageChange(direction) {
        if (!this.photoList) return;

        const exitX = direction === 'forward' ? '-30px' : '30px';
        const enterX = direction === 'forward' ? '30px' : '-30px';

        this.photoList.style.setProperty('--exit-x', exitX);
        this.photoList.style.setProperty('--enter-x', enterX);

        this.photoList.classList.remove('page-enter');
        this.photoList.classList.add('page-exit');

        this.photoList.addEventListener('animationend', () => {
            this.photoList.classList.remove('page-exit');
            this._renderPage();

            this.photoList.classList.add('page-enter');
            this.photoList.addEventListener('animationend', () => {
                this.photoList.classList.remove('page-enter');
            }, { once: true });
        }, { once: true });
    }

    openEditModal(photoId) {
        const photo = this.photos.find(p => p.id === photoId);
        if (!photo) return;

        this.selectedPhotoId = photoId;
        this.editPhotoTitle.value = photo.title;
        this.editPhotoDescription.value = photo.description || '';
        this.editCharCount.textContent = (photo.description || '').length;
        this.editMessage.classList.add('hidden');

        this.editModal.classList.remove('hidden');
        this.editPhotoTitle.focus();
    }

    closeEditModal_() {
        this.editModal.classList.add('hidden');
        this.selectedPhotoId = null;
    }

    async handleEditSubmit(e) {
        e.preventDefault();

        if (!this.selectedPhotoId) return;

        const newTitle = this.editPhotoTitle.value.trim();
        const newDescription = this.editPhotoDescription.value.trim();

        if (!newTitle) {
            this.showEditMessage('Title cannot be empty', 'error');
            return;
        }

        try {
            this.saveEditBtn.disabled = true;
            this.showEditMessage('Saving changes...', 'info');

            const response = await fetch('/.netlify/functions/update-image-metadata', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    publicId: this.selectedPhotoId,
                    title: newTitle,
                    description: newDescription,
                    userEmail: this.currentUser.email,
                })
            });

            if (!response.ok) {
                let errText = response.statusText;
                try {
                    const json = await response.json();
                    errText = json.details || json.message || errText;
                } catch (err) {}
                throw new Error(errText || 'Failed to update photo');
            }

            const photoIdx = this.photos.findIndex(p => p.id === this.selectedPhotoId);
            if (photoIdx !== -1) {
                this.photos[photoIdx].title = newTitle;
                this.photos[photoIdx].description = newDescription;
            }

            this.showEditMessage('Photo updated successfully!', 'success');
            setTimeout(() => {
                this.closeEditModal_();
                this.displayPhotos();
            }, 900);

        } catch (error) {
            this.showEditMessage('Error: ' + error.message, 'error');
            console.error('Edit error:', error);
        } finally {
            this.saveEditBtn.disabled = false;
        }
    }

    openDeleteModal(photoId) {
        this.selectedPhotoId = photoId;
        this.deleteModal.classList.remove('hidden');
    }

    closeDeleteModal() {
        this.deleteModal.classList.add('hidden');
        this.selectedPhotoId = null;
    }

    // FIXED delete: compatibility keys, robust response handling, UI updates
    async confirmDelete() {
        if (!this.selectedPhotoId) return;

        try {
            this.confirmDeleteBtn.disabled = true;

            // Send both keys in body to be safe for various function implementations
            const response = await fetch('/.netlify/functions/delete-images', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    publicId: this.selectedPhotoId,
                    public_id: this.selectedPhotoId,
                    userEmail: this.currentUser.email,
                })
            });

            if (!response.ok) {
                // try to parse JSON error details safely
                let errText = response.statusText || `Status ${response.status}`;
                try {
                    const json = await response.json();
                    errText = json.details || json.message || errText;
                } catch (_) {
                    // non-json response — try to read text
                    try {
                        const txt = await response.text();
                        if (txt) errText = txt;
                    } catch (_) {}
                }
                throw new Error(errText || 'Failed to delete photo');
            }

            // success — remove from local array
            this.photos = this.photos.filter(p => p.id !== this.selectedPhotoId);

            this.closeDeleteModal();

            // re-render photos and show empty state if needed
            this.displayPhotos();

            if (this.photos.length === 0) {
                this.photoList.classList.add('hidden');
                this.emptyState.classList.remove('hidden');
            }

            this.showToast('Photo deleted successfully', 'success');

        } catch (error) {
            console.error('Delete error:', error);
            this.showToast('Error deleting photo: ' + (error.message || 'Unknown error'), 'error');
        } finally {
            this.confirmDeleteBtn.disabled = false;
        }
    }

    updateEditCharCount(e) {
        this.editCharCount.textContent = e.target.value.length;
    }

    showEditMessage(message, type) {
        this.editMessage.textContent = message;
        this.editMessage.className = `form-message ${type}`;
        this.editMessage.classList.remove('hidden');
    }

    logout() {
        netlifyIdentity.logout();
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 500);
    }

    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <span>${this.escapeHtml(message)}</span>
            <button class="toast-close">
                <i class="fas fa-times"></i>
            </button>
        `;

        this.toastContainer.appendChild(toast);
        toast.querySelector('.toast-close').addEventListener('click', () => toast.remove());
        setTimeout(() => toast.remove(), 5000);
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /*************************
     * Image modal functions
     *************************/

    initImageModal() {
        if (this.modalInitialized) return;
        this.modalInitialized = true;

        // Modal CSS (brighter + blurred background + tooltips)
        const modalCss = `
        /* backdrop layer: brighter and blurred */
        .image-modal { position: fixed; inset: 0; display:flex; flex-direction:column; justify-content:center; align-items:center; background: rgba(25,25,30,0.78); backdrop-filter: blur(8px) saturate(120%); z-index:99999; -webkit-tap-highlight-color: transparent; font-family: inherit; }
        .image-modal.hidden{ display:none; }

        .image-modal-toolbar{ position:absolute; top:18px; left:18px; right:18px; display:flex; align-items:center; justify-content:space-between; pointer-events:none; }

        .modal-actions{ pointer-events:auto; }

        /* Prev/Next: accent-colored circular icons */
        .modal-icon-btn{ pointer-events:auto; appearance:none; background: linear-gradient(135deg, var(--accent), var(--accent-dark)); border:none; color:var(--white); width:46px; height:46px; display:inline-flex; align-items:center; justify-content:center; border-radius:50%; cursor:pointer; font-size:18px; box-shadow: var(--shadow-md); transition: var(--transition); margin:0 6px; position:relative; }
        .modal-icon-btn.secondary{ background: rgba(255,255,255,0.06); color:var(--text-primary); width:42px; height:42px; }

        .modal-icon-btn:hover{ transform: translateY(-3px); box-shadow: var(--shadow-lg); }

        .image-modal-viewport{ width:92%; max-width:1200px; height:78%; max-height:860px; display:flex; justify-content:center; align-items:center; overflow:hidden; touch-action:none; position:relative; border-radius: calc(var(--radius-lg) + 0.25rem); box-shadow: 0 30px 60px rgba(0,0,0,0.45); background: linear-gradient(180deg, rgba(255,255,255,0.02), rgba(0,0,0,0.06)); border: 1px solid rgba(255,255,255,0.02); }

        .image-modal-viewport img{ max-width:100%; max-height:100%; transform-origin:center center; transition: transform 160ms ease; will-change: transform; user-select:none; -webkit-user-drag:none; cursor:grab; border-radius:0.5rem; box-shadow: 0 10px 30px rgba(0,0,0,0.6); border:1px solid rgba(255,255,255,0.03); }
        .image-modal-viewport img.dragging{ cursor:grabbing; transition:none; }

        .image-caption { width:92%; max-width:1200px; color:var(--text-primary); margin-top:14px; display:flex; align-items:center; justify-content:space-between; gap:12px; }
        .image-caption .title { font-weight:600; color:var(--text-primary); font-size:1rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:70%; }

        .share-controls { display:flex; gap:10px; align-items:center; }
        .share-btn { background: linear-gradient(135deg, var(--accent), var(--accent-dark)); color:var(--white); padding:8px 12px; border-radius:8px; border:none; cursor:pointer; font-weight:600; box-shadow: var(--shadow-md); transition: var(--transition); }
        .share-btn.secondary { background: rgba(255,255,255,0.06); color:var(--text-primary); }
        .share-copied { font-size:0.9rem; color:var(--success); margin-left:8px; opacity:0; transition: opacity .25s ease; }
        .share-copied.visible { opacity:1; }

        /* Tooltips: theme-matching popups for buttons */
        .modal-icon-btn[data-tooltip]::after {
            content: attr(data-tooltip);
            position: absolute;
            bottom: calc(100% + 10px);
            left: 50%;
            transform: translateX(-50%) translateY(6px);
            background: linear-gradient(135deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02));
            color: var(--text-primary);
            padding: 6px 10px;
            border-radius: 8px;
            font-size: 0.85rem;
            white-space: nowrap;
            box-shadow: var(--shadow-md);
            opacity: 0;
            pointer-events: none;
            transition: opacity .16s ease, transform .16s ease;
            z-index: 100000;
            border: 1px solid rgba(255,255,255,0.03);
            backdrop-filter: blur(6px);
        }
        .modal-icon-btn[data-tooltip]:hover::after,
        .modal-icon-btn[data-tooltip]:focus::after {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
        }

        /* copy link tooltip (uses same attr) */
        #copyLinkBtn[data-tooltip]::after {
            content: attr(data-tooltip);
            position: absolute;
            bottom: calc(100% + 10px);
            right: 0;
            transform: translateY(6px);
            background: linear-gradient(135deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02));
            color: var(--text-primary);
            padding: 6px 10px;
            border-radius: 8px;
            font-size: 0.85rem;
            white-space: nowrap;
            box-shadow: var(--shadow-md);
            opacity: 0;
            pointer-events: none;
            transition: opacity .16s ease, transform .16s ease;
            z-index: 100000;
            border: 1px solid rgba(255,255,255,0.03);
            backdrop-filter: blur(6px);
        }
        #copyLinkBtn[data-tooltip]:hover::after,
        #copyLinkBtn[data-tooltip]:focus::after {
            opacity: 1;
            transform: translateY(0);
        }

        @media (max-width:640px){ .image-modal-viewport{ width:98%; height:74%; } .modal-icon-btn{ width:42px; height:42px; font-size:16px; } .image-caption .title{ max-width:60%; } }
        `;
        const style = document.createElement('style');
        style.setAttribute('data-picload-modal-style', 'true');
        style.appendChild(document.createTextNode(modalCss));
        document.head.appendChild(style);

        // Modal markup (tooltips via data-tooltip)
        const modal = document.createElement('div');
        modal.id = 'imageModal';
        modal.className = 'image-modal hidden';
        modal.setAttribute('aria-hidden', 'true');
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-label', 'Image viewer');
        modal.innerHTML = `
            <div class="image-modal-toolbar">
                <div>
                    <button id="imagePrev" class="modal-icon-btn" data-tooltip="Previous (Left)" title="Previous (Left)"><i class="fas fa-chevron-left"></i></button>
                    <button id="imageNext" class="modal-icon-btn" data-tooltip="Next (Right)" title="Next (Right)"><i class="fas fa-chevron-right"></i></button>
                </div>
                <div class="modal-actions">
                    <button id="imageClose" class="modal-icon-btn secondary" data-tooltip="Close (Esc)" aria-label="Close (Esc)"><i class="fas fa-times"></i></button>
                </div>
            </div>

            <div class="image-modal-viewport" id="imageViewport">
                <img id="imageModalImg" src="" alt="" draggable="false">
            </div>

            <div class="image-caption" id="imageCaption" aria-live="polite">
                <div class="title" id="imageCaptionTitle"></div>
                <div class="share-controls">
                    <div style="position:relative;">
                      <button id="copyLinkBtn" class="share-btn" data-tooltip="Copy share link" title="Copy share link"><i class="fas fa-link"></i>&nbsp;Copy Link</button>
                    </div>
                    <span id="shareCopied" class="share-copied">Copied!</span>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        // Cache modal elements
        this.modal = document.getElementById('imageModal');
        this.modalImg = document.getElementById('imageModalImg');
        this.viewport = document.getElementById('imageViewport');
        this.btnClose = document.getElementById('imageClose');
        this.btnPrev = document.getElementById('imagePrev');
        this.btnNext = document.getElementById('imageNext');
        this.captionEl = document.getElementById('imageCaption');
        this.captionTitleEl = document.getElementById('imageCaptionTitle');
        this.copyLinkBtn = document.getElementById('copyLinkBtn');
        this.shareCopiedEl = document.getElementById('shareCopied');

        // Modal state
        this.modalState = {
            index: -1,
            scale: 1,
            minScale: 1,
            maxScale: 4,
            translateX: 0,
            translateY: 0,
            isPanning: false,
            lastClientX: 0,
            lastClientY: 0,
            touchMode: null,
            lastPinchDistance: 0,
            swipeStartX: null,
            swipeStartY: null,
        };

        // bind handlers
        this._onKeyDown = this._onKeyDown.bind(this);
        this._onWheel = this._onWheel.bind(this);
        this._onMouseDown = this._onMouseDown.bind(this);
        this._onMouseMove = this._onMouseMove.bind(this);
        this._onMouseUp = this._onMouseUp.bind(this);
        this._onDblClick = this._onDblClick.bind(this);
        this._onTouchStart = this._onTouchStart.bind(this);
        this._onTouchMove = this._onTouchMove.bind(this);
        this._onTouchEnd = this._onTouchEnd.bind(this);
        this._onClose = this._onClose.bind(this);
        this._onPrev = this._onPrev.bind(this);
        this._onNext = this._onNext.bind(this);

        // attach handlers
        this.btnClose.addEventListener('click', this._onClose);
        this.btnPrev.addEventListener('click', this._onPrev);
        this.btnNext.addEventListener('click', this._onNext);

        this.viewport.addEventListener('wheel', this._onWheel, { passive: false });
        this.viewport.addEventListener('mousedown', this._onMouseDown);
        window.addEventListener('mouseup', this._onMouseUp);
        this.modalImg.addEventListener('dblclick', this._onDblClick);

        this.viewport.addEventListener('touchstart', this._onTouchStart, { passive: false });
        this.viewport.addEventListener('touchmove', this._onTouchMove, { passive: false });
        this.viewport.addEventListener('touchend', this._onTouchEnd);

        // copy link behavior
        this.copyLinkBtn.addEventListener('click', (e) => {
            const idx = this.modalState.index;
            if (idx == null || !this.photos[idx]) return;
            const photo = this.photos[idx];
            const publicId = photo.id || photo.public_id || '';
            const encoded = encodeURIComponent(publicId);
            const shareUrl = `${location.origin}/photo.html?id=${encoded}`;
            navigator.clipboard?.writeText(shareUrl)
                .then(() => {
                    this.shareCopiedEl.classList.add('visible');
                    setTimeout(() => this.shareCopiedEl.classList.remove('visible'), 1400);
                })
                .catch(() => {
                    // fallback: temporary input
                    const tmp = document.createElement('input');
                    tmp.value = shareUrl;
                    document.body.appendChild(tmp);
                    tmp.select();
                    try { document.execCommand('copy'); this.shareCopiedEl.classList.add('visible'); setTimeout(() => this.shareCopiedEl.classList.remove('visible'), 1400); } catch (_) {}
                    tmp.remove();
                });
        });

        // close when clicking outside the image
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) this._onClose();
        });
    }

    openImageModalByIndex(index) {
        if (!Array.isArray(this.photos) || this.photos.length === 0) return;
        if (index < 0) index = 0;
        if (index >= this.photos.length) index = this.photos.length - 1;

        this.modalState.index = index;
        const photo = this.photos[index];

        // use photo.url if present; optional Cloudinary construction commented below
        // const cloudUrl = `https://res.cloudinary.com/YOUR_CLOUD_NAME/image/upload/${encodeURIComponent(photo.id)}`;
        // this.modalImg.src = photo.url || cloudUrl;

        // Lock body scrolling while modal open
        document.body.style.overflow = 'hidden';

        // Wait for image to load before resetting transforms to avoid jumps
        this.modalImg.onload = () => {
            // reset transform + state
            this.modalState.scale = 1;
            this.modalState.translateX = 0;
            this.modalState.translateY = 0;
            this.modalState.lastPinchDistance = 0;
            this._applyTransform();
        };
        this.modalImg.onerror = () => {
            this.showToast('Failed to load image', 'error');
        };

        this.modalImg.src = photo.url;
        this.modalImg.alt = photo.title || 'Photo';

        // populate caption title
        const title = photo.title || 'Untitled';
        this.captionTitleEl.textContent = title;

        // show modal and attach keyboard
        this.modal.classList.remove('hidden');
        this.modal.setAttribute('aria-hidden', 'false');
        window.addEventListener('keydown', this._onKeyDown);

        // focus first actionable button for keyboard users
        setTimeout(() => {
            try { this.btnPrev.focus(); } catch (_) {}
        }, 60);
    }

    _closeModalInternal() {
        this.modal.classList.add('hidden');
        this.modal.setAttribute('aria-hidden', 'true');
        // clear src to free memory
        this.modalImg.src = '';
        window.removeEventListener('keydown', this._onKeyDown);

        // restore body scrolling
        document.body.style.overflow = '';
    }

    _onPrev() {
        const idx = this.modalState.index - 1;
        if (idx >= 0) this.openImageModalByIndex(idx);
    }

    _onNext() {
        const idx = this.modalState.index + 1;
        if (idx < this.photos.length) this.openImageModalByIndex(idx);
    }

    _onKeyDown(e) {
        if (e.key === 'Escape') {
            this._onClose();
        } else if (e.key === 'ArrowLeft') {
            this._onPrev();
        } else if (e.key === 'ArrowRight') {
            this._onNext();
        }
    }

    _onClose() {
        this._closeModalInternal();
    }

    _onWheel(e) {
        e.preventDefault();
        const delta = -e.deltaY;
        const zoomFactor = delta > 0 ? 1.12 : 0.88;
        const oldScale = this.modalState.scale;
        let newScale = oldScale * zoomFactor;
        newScale = Math.max(this.modalState.minScale, Math.min(this.modalState.maxScale, newScale));
        const rect = this.viewport.getBoundingClientRect();

        const clientX = e.clientX;
        const clientY = e.clientY;
        const offsetX = clientX - rect.left - rect.width / 2;
        const offsetY = clientY - rect.top - rect.height / 2;

        const scaleDelta = newScale / oldScale;
        this.modalState.translateX = (this.modalState.translateX - offsetX) * scaleDelta + offsetX;
        this.modalState.translateY = (this.modalState.translateY - offsetY) * scaleDelta + offsetY;
        this.modalState.scale = newScale;
        this._clampTranslate();
        this._applyTransform();
    }

    _onMouseDown(e) {
        if (e.button !== 0) return;
        this.modalState.isPanning = true;
        this.modalImg.classList.add('dragging');
        this.modalState.lastClientX = e.clientX;
        this.modalState.lastClientY = e.clientY;
        window.addEventListener('mousemove', this._onMouseMove);
    }

    _onMouseMove(e) {
        if (!this.modalState.isPanning) return;
        const dx = e.clientX - this.modalState.lastClientX;
        const dy = e.clientY - this.modalState.lastClientY;
        this.modalState.lastClientX = e.clientX;
        this.modalState.lastClientY = e.clientY;

        if (this.modalState.scale > 1.01) {
            this.modalState.translateX += dx;
            this.modalState.translateY += dy;
            this._clampTranslate();
            this._applyTransform();
        }
    }

    _onMouseUp() {
        this.modalState.isPanning = false;
        this.modalImg.classList.remove('dragging');
        window.removeEventListener('mousemove', this._onMouseMove);
    }

    _onDblClick(e) {
        e.preventDefault();
        const oldScale = this.modalState.scale;
        if (oldScale <= 1.05) {
            const newScale = 2.2;
            this.modalState.scale = Math.min(newScale, this.modalState.maxScale);
            const rect = this.viewport.getBoundingClientRect();
            const offsetX = e.clientX - rect.left - rect.width / 2;
            const offsetY = e.clientY - rect.top - rect.height / 2;
            this.modalState.translateX = (this.modalState.translateX - offsetX) * (this.modalState.scale / oldScale) + offsetX;
            this.modalState.translateY = (this.modalState.translateY - offsetY) * (this.modalState.scale / oldScale) + offsetY;
        } else {
            this.modalState.scale = 1;
            this.modalState.translateX = 0;
            this.modalState.translateY = 0;
        }
        this._clampTranslate();
        this._applyTransform();
    }

    _onTouchStart(e) {
        if (!e.touches || e.touches.length === 0) return;
        if (e.touches.length === 1) {
            const t = e.touches[0];
            this.modalState.touchMode = 'pan';
            this.modalState.lastClientX = t.clientX;
            this.modalState.lastClientY = t.clientY;
            this.modalState.swipeStartX = t.clientX;
            this.modalState.swipeStartY = t.clientY;
        } else if (e.touches.length === 2) {
            this.modalState.touchMode = 'pinch';
            const d = this._touchDistance(e.touches[0], e.touches[1]);
            this.modalState.lastPinchDistance = d;
        }
    }

    _onTouchMove(e) {
        if (!e.touches || e.touches.length === 0) return;
        e.preventDefault();

        if (e.touches.length === 1 && this.modalState.touchMode === 'pan') {
            const t = e.touches[0];
            const dx = t.clientX - this.modalState.lastClientX;
            const dy = t.clientY - this.modalState.lastClientY;
            this.modalState.lastClientX = t.clientX;
            this.modalState.lastClientY = t.clientY;

            if (this.modalState.scale > 1.01) {
                this.modalState.translateX += dx;
                this.modalState.translateY += dy;
                this._clampTranslate();
                this._applyTransform();
            }
        } else if (e.touches.length === 2) {
            const d = this._touchDistance(e.touches[0], e.touches[1]);
            if (!this.modalState.lastPinchDistance) {
                this.modalState.lastPinchDistance = d;
                return;
            }
            const scaleChange = d / this.modalState.lastPinchDistance;
            let newScale = this.modalState.scale * scaleChange;
            newScale = Math.max(this.modalState.minScale, Math.min(this.modalState.maxScale, newScale));

            const rect = this.viewport.getBoundingClientRect();
            const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
            const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
            const offsetX = midX - rect.left - rect.width / 2;
            const offsetY = midY - rect.top - rect.height / 2;

            const scaleDelta = newScale / this.modalState.scale;
            this.modalState.translateX = (this.modalState.translateX - offsetX) * scaleDelta + offsetX;
            this.modalState.translateY = (this.modalState.translateY - offsetY) * scaleDelta + offsetY;

            this.modalState.scale = newScale;
            this.modalState.lastPinchDistance = d;
            this._clampTranslate();
            this._applyTransform();
        }
    }

    _onTouchEnd(e) {
        if (!e.touches || e.touches.length < 2) {
            this.modalState.lastPinchDistance = 0;
        }

        const sx = this.modalState.swipeStartX;
        const sy = this.modalState.swipeStartY;
        if (sx != null && e.changedTouches && e.changedTouches.length > 0) {
            const endX = e.changedTouches[0].clientX;
            const endY = e.changedTouches[0].clientY;
            const dx = endX - sx;
            const dy = endY - sy;
            const absDx = Math.abs(dx);
            const absDy = Math.abs(dy);
            const SWIPE_MIN = 40;
            const SWIPE_MAX_VERTICAL_DEVIATION = 100;

            if (absDx > SWIPE_MIN && absDy < SWIPE_MAX_VERTICAL_DEVIATION && this.modalState.scale <= 1.05) {
                if (dx < 0) this._onNext();
                else this._onPrev();
            }
        }

        this.modalState.touchMode = null;
        this.modalState.swipeStartX = null;
        this.modalState.swipeStartY = null;
    }

    _touchDistance(t1, t2) {
        const dx = t2.clientX - t1.clientX;
        const dy = t2.clientY - t1.clientY;
        return Math.hypot(dx, dy);
    }

    _applyTransform() {
        const s = this.modalState.scale;
        const tx = this.modalState.translateX;
        const ty = this.modalState.translateY;
        this.modalImg.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`;
    }

    _clampTranslate() {
        // use viewport + image bounding to compute generous clamps (avoid sticky behavior)
        const rect = this.viewport.getBoundingClientRect();
        const vw = rect.width;
        const vh = rect.height;

        const imgRect = this.modalImg.getBoundingClientRect();
        const scaledWidth = Math.max(0, imgRect.width);
        const scaledHeight = Math.max(0, imgRect.height);

        const bw = Math.max(0, (scaledWidth - vw) / 2);
        const bh = Math.max(0, (scaledHeight - vh) / 2);

        const MAX_PAD = 5000;
        this.modalState.translateX = Math.min(bw + MAX_PAD, Math.max(-bw - MAX_PAD, this.modalState.translateX));
        this.modalState.translateY = Math.min(bh + MAX_PAD, Math.max(-bh - MAX_PAD, this.modalState.translateY));
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.dashboard = new PICLOADDashboard();
});