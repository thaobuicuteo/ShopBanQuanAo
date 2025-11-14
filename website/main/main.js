const API_BASE = 'http://localhost:3000/api';

// Hàm lấy query từ URL
function getQueryParam(param) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(param);
}

// Hàm tải và hiển thị bộ sưu tập trong menu
async function loadCollections() {
    try {
        const res = await fetch(`${API_BASE}/collections`);
        if (!res.ok) throw new Error('Lỗi khi lấy dữ liệu bộ sưu tập');
        const collections = await res.json();
        
        const dropdownContent = document.querySelector('.dropdown-content');
        if (dropdownContent) {
            dropdownContent.innerHTML = '';
            collections.forEach(collection => {
                const link = document.createElement('a');
                link.href = `collections.html?collection=${encodeURIComponent(collection.collection_id)}`;
                link.textContent = collection.collection_name;
                dropdownContent.appendChild(link);
            });
        }
    } catch (error) {
        console.error('Lỗi tải bộ sưu tập:', error);
    }
}

async function loadProducts() {
    try {
        if (window.location.pathname.includes('category.html')) {
            const category = getQueryParam('category');
            if (!category) {
                document.getElementById('categoryGrid').innerHTML = '<p>Không tìm thấy danh mục.</p>';
                return;
            }

            // Tải toàn bộ sản phẩm
            const res = await fetch(`${API_BASE}/products`);
            if (!res.ok) throw new Error('Lỗi khi lấy dữ liệu sản phẩm');
            const products = await res.json();

            // Lọc sản phẩm theo danh mục
            let filteredProducts;
            switch (category) {
                case 'vay-ngan':
                    filteredProducts = products.filter(p => p.product_name.toLowerCase().includes('váy ngắn'));
                    break;
                case 'vay-dai':
                    filteredProducts = products.filter(p => p.product_name.toLowerCase().includes('váy dài'));
                    break;
                case 'ao':
                    filteredProducts = products.filter(p => p.product_name.toLowerCase().includes('áo'));
                    break;
                case 'chan-vay':
                    filteredProducts = products.filter(p => p.product_name.toLowerCase().includes('chân váy'));
                    break;
                case 'set-bo':
                    filteredProducts = products.filter(p => p.product_name.toLowerCase().includes('set'));
                    break;
                default:
                    filteredProducts = products;
            }

            // Cập nhật tiêu đề dựa trên category
            const displayName = {
                'vay-ngan': 'VÁY NGẮN',
                'vay-dai': 'VÁY DÀI',
                'ao': 'ÁO',
                'chan-vay': 'CHÂN VÁY',
                'set-bo': 'SET BỘ'
            }[category] || category.replace('-', ' ').toUpperCase();
            
            document.getElementById('pageTitle').textContent = displayName;
            document.getElementById('categoryTitle').textContent = displayName;

            updateProductGrid('categoryGrid', filteredProducts);
        } else if (window.location.pathname.includes('collections.html')) {
            const collectionId = getQueryParam('collection');
            if (!collectionId) {
                document.getElementById('collectionGrid').innerHTML = '<p>Không tìm thấy bộ sưu tập.</p>';
                return;
            }

            // Tải sản phẩm theo collection_id
            const res = await fetch(`${API_BASE}/products?collection=${collectionId}`);
            if (!res.ok) throw new Error('Lỗi khi lấy dữ liệu sản phẩm');
            const products = await res.json();

            // Lấy thông tin bộ sưu tập để hiển thị tiêu đề và background
            const collectionRes = await fetch(`${API_BASE}/collections/${collectionId}`);
            if (!collectionRes.ok) throw new Error('Lỗi khi lấy thông tin bộ sưu tập');
            const collection = await collectionRes.json();

            // Debugging: In ra dữ liệu collection để kiểm tra
            console.log('Collection data:', collection);

            document.getElementById('pageTitle').textContent = collection.collection_name;
            document.getElementById('collectionTitle').textContent = collection.collection_name;
            document.getElementById('collectionYear').textContent = collection.year_launch;
            

            // Cập nhật background image cho body
            if (collection.image_url) {
                console.log('Setting background image:', collection.image_url);
                document.body.style.backgroundImage = `url(${collection.image_url})`;
                document.body.style.backgroundSize = 'cover';
                document.body.style.backgroundPosition = 'center';
                document.body.style.backgroundRepeat = 'no-repeat';
            } else {
                // Fallback image nếu image_url không tồn tại
                console.warn('No image_url found, using fallback image');
                document.body.style.backgroundImage = 'url(/images/fallback-background.jpg)';
            }

            updateProductGrid('collectionGrid', products);
        } else {
            // Logic cho index.html
            const res = await fetch(`${API_BASE}/products`);
            if (!res.ok) throw new Error('Lỗi khi lấy dữ liệu sản phẩm');
            const products = await res.json();
                // Lấy random 6 sản phẩm
            const randomSix = [...products]                // copy mảng
                .sort(() => Math.random() - 0.5)           // shuffle
                .slice(0, 4);                              // lấy 6 phần tử

            updateProductGrid('bestSellerGrid', randomSix);
            // updateProductGrid('bestSellerGrid', products.filter(p => p.is_bestseller || p.sold_count > 3));
            updateProductGrid('vayNganGrid', products.filter(p => p.product_name.toLowerCase().includes('váy ngắn')));
            updateProductGrid('chanVayGrid', products.filter(p => p.product_name.toLowerCase().includes('chân váy')));
            updateProductGrid('vayDaiGrid', products.filter(p => p.product_name.toLowerCase().includes('váy dài')));
            updateProductGrid('setBoGrid', products.filter(p => p.product_name.toLowerCase().includes('set')));
            updateProductGrid('aoGrid', products.filter(p => p.product_name.toLowerCase().includes('áo')));
        }
    } catch (error) {
        console.error('Lỗi tải sản phẩm:', error);
        const grid = document.getElementById('categoryGrid') || document.getElementById('bestSellerGrid') || document.getElementById('collectionGrid');
        if (grid) grid.innerHTML = '<p>Lỗi tải sản phẩm. Vui lòng thử lại.</p>';
    }
}

function updateProductGrid(gridId, products) {
    const grid = document.getElementById(gridId);
    if (!grid) return;
    grid.innerHTML = products.map(product => `
        <div class="product-card" onclick="viewProductDetail('${encodeURIComponent(JSON.stringify(product))}')">
            <img src="${product.image_url}" alt="${product.product_name}">
            <h3>${product.product_name}</h3>
            <p class="price">
                ${product.price === product.price_promotion ?
            `<span class="price-promotion">${formatCurrency(product.price)}đ</span>` :
            `<span class="price-promotion">${formatCurrency(product.price_promotion)}đ</span>
                     <span class="price-original">${formatCurrency(product.price)}đ</span>`
        }
            </p>
        </div>
    `).join('');
}

function viewProductDetail(productString) {
    window.location.href = `xemchitietsp.html?product=${productString}`;
}

function formatCurrency(value) {
    return Number(value).toLocaleString('vi-VN');
}

async function sortProducts(type) {
    const collectionId = getQueryParam('collection');
    const category = getQueryParam('category');
    
    let url;
    if (window.location.pathname.includes('category.html')) {
        if (!category) return;
        url = `${API_BASE}/products?category=${encodeURIComponent(category)}`;
    } else if (window.location.pathname.includes('collections.html')) {
        if (!collectionId) return;
        url = `${API_BASE}/products?collection=${collectionId}`;
    } else {
        return;
    }

    if (type !== 'all') {
        url += `&sort=${type}`;
    }

    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error('Lỗi khi lấy dữ liệu sản phẩm');
        const products = await res.json();
        updateProductGrid(window.location.pathname.includes('category.html') ? 'categoryGrid' : 'collectionGrid', products);
    } catch (error) {
        console.error('Lỗi sắp xếp:', error);
        updateProductGrid(window.location.pathname.includes('category.html') ? 'categoryGrid' : 'collectionGrid', []);
    }
}

window.addEventListener('load', () => {
    loadCollections();
    loadProducts();
});