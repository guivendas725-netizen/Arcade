import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { Heart, Menu, Minus, Plus, Search, ShoppingBag, SlidersHorizontal, X } from "lucide-react";
import "./styles.css";

const phone = "5565992807604";
const sizes = ["P", "M", "G", "GG"];

const products = [
  {
    id: "ribbed-black",
    name: "Ribbed Black",
    category: "Camisetas",
    color: "Preto",
    tag: "Mais vendida",
    image: "/images/polo-black.png",
    price: 249.9,
    oldPrice: 299.9,
    description: "Ribana preta premium, gola com ziper metalico e logo discreta.",
  },
  {
    id: "ribbed-white",
    name: "Ribbed White",
    category: "Camisetas",
    color: "Branco",
    tag: "Edicao limitada",
    image: "/images/polo-white.png",
    price: 249.9,
    oldPrice: 299.9,
    description: "Ribana branca premium, acabamento limpo e caimento elegante.",
  },
];

const formatBRL = (value) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const buildWhatsappUrl = (cart) => {
  if (!cart.length) {
    return `https://wa.me/${phone}?text=${encodeURIComponent("Ola, quero encomendar uma peca da ARCADE.CO.")}`;
  }

  const lines = cart.map((item) => {
    const product = products.find((entry) => entry.id === item.id);
    return `- ${product.name} | tamanho ${item.size} | qtd ${item.qty} | ${formatBRL(product.price * item.qty)}`;
  });
  const total = cart.reduce((sum, item) => {
    const product = products.find((entry) => entry.id === item.id);
    return sum + product.price * item.qty;
  }, 0);

  return `https://wa.me/${phone}?text=${encodeURIComponent(
    `Ola, quero encomendar essas pecas da ARCADE.CO:\n${lines.join("\n")}\nTotal: ${formatBRL(total)}`
  )}`;
};

const getRoute = () => {
  const hash = window.location.hash.replace("#", "");
  if (!hash || hash === "/") return { page: "home" };
  if (hash.startsWith("produto/")) return { page: "product", id: hash.split("/")[1] };
  if (hash === "camisetas") return { page: "shop" };
  if (hash === "sobre") return { page: "about" };
  return { page: "home" };
};

const goTo = (hash) => {
  window.location.hash = hash;
  window.scrollTo({ top: 0, behavior: "smooth" });
};

function Header({ cartCount, onCartOpen }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="store-header">
      <div className="topbar">
        <span>Producao sob encomenda</span>
        <span>Entrega combinada via WhatsApp</span>
        <span>Quantidade limitada</span>
      </div>

      <div className="header-main">
        <button className="icon-button mobile-only" type="button" onClick={() => setMenuOpen(true)} aria-label="Abrir menu">
          <Menu size={22} />
        </button>

        <button className="logo logo-button" type="button" onClick={() => goTo("")}>ARCADE<span>.</span>CO</button>

        <label className="search-box">
          <Search size={18} />
          <input type="search" placeholder="Buscar camisetas, ribana, preto..." />
        </label>

        <nav className="desktop-nav" aria-label="Categorias">
          <button type="button" onClick={() => goTo("")}>Inicio</button>
          <button type="button" onClick={() => goTo("camisetas")}>Camisetas</button>
          <button type="button" onClick={() => goTo("sobre")}>Marca</button>
        </nav>

        <button className="bag-button" type="button" onClick={onCartOpen} aria-label="Abrir sacola">
          <ShoppingBag size={21} />
          <span>{cartCount}</span>
        </button>
      </div>

      <div className={`mobile-menu ${menuOpen ? "is-open" : ""}`}>
        <button className="icon-button close-menu" type="button" onClick={() => setMenuOpen(false)} aria-label="Fechar menu">
          <X size={22} />
        </button>
        <button type="button" onClick={() => { setMenuOpen(false); goTo(""); }}>Inicio</button>
        <button type="button" onClick={() => { setMenuOpen(false); goTo("camisetas"); }}>Camisetas</button>
        <button type="button" onClick={() => { setMenuOpen(false); goTo("sobre"); }}>Marca</button>
      </div>
    </header>
  );
}

function HomePage() {
  return (
    <section className="home-page">
      <div className="store-hero">
        <div className="hero-copy">
          <p>Nova colecao sob encomenda</p>
          <h1>Roupas masculinas elegantes para comprar agora.</h1>
          <span>Voce nao veste uma camiseta. Voce veste a ARCADE.CO.</span>
          <button type="button" className="shop-link" onClick={() => goTo("camisetas")}>Comprar colecao</button>
        </div>
        <button className="hero-card" type="button" onClick={() => goTo("camisetas")}>
          <img src="/images/hero.png" alt="Modelo vestindo camiseta ARCADE.CO preta" />
        </button>
      </div>

      <div className="home-categories">
        <button type="button" onClick={() => goTo("produto/ribbed-black")}>
          <img src="/images/polo-black.png" alt="Ribbed Black ARCADE.CO" />
          <span>Ribbed Black</span>
        </button>
        <button type="button" onClick={() => goTo("produto/ribbed-white")}>
          <img src="/images/polo-white.png" alt="Ribbed White ARCADE.CO" />
          <span>Ribbed White</span>
        </button>
      </div>
    </section>
  );
}

function CategoryRail({ active, onChange }) {
  const categories = ["Todos", "Preto", "Branco", "Mais vendidos", "Limitados"];

  return (
    <div className="category-rail" aria-label="Filtros de produto">
      {categories.map((category) => (
        <button
          className={active === category ? "is-active" : ""}
          key={category}
          type="button"
          onClick={() => onChange(category)}
        >
          {category}
        </button>
      ))}
    </div>
  );
}

function ProductCard({ product, onAdd }) {
  const [selectedSize, setSelectedSize] = useState("M");

  return (
    <article className="commerce-card">
      <button className="favorite-button" type="button" aria-label={`Favoritar ${product.name}`}>
        <Heart size={18} />
      </button>
      <button className="product-photo" type="button" onClick={() => goTo(`produto/${product.id}`)}>
        <span>{product.tag}</span>
        <img src={product.image} alt={product.name} />
      </button>

      <div className="commerce-info">
        <div>
          <p className="product-category">{product.category}</p>
          <button className="product-title" type="button" onClick={() => goTo(`produto/${product.id}`)}>
            {product.name}
          </button>
          <p className="product-desc">{product.description}</p>
        </div>

        <div className="price-row">
          <strong>{formatBRL(product.price)}</strong>
          <span>{formatBRL(product.oldPrice)}</span>
        </div>
        <p className="installments">ou 3x de {formatBRL(product.price / 3)} sem juros</p>

        <div className="size-row" aria-label={`Tamanho de ${product.name}`}>
          {sizes.map((size) => (
            <button
              className={selectedSize === size ? "is-active" : ""}
              key={size}
              type="button"
              onClick={() => setSelectedSize(size)}
            >
              {size}
            </button>
          ))}
        </div>

        <button className="add-button" type="button" onClick={() => onAdd(product.id, selectedSize)}>
          Adicionar a sacola
        </button>
      </div>
    </article>
  );
}

function ShopPage({ onAdd }) {
  const [activeFilter, setActiveFilter] = useState("Todos");

  const filteredProducts = useMemo(() => {
    if (activeFilter === "Todos") return products;
    if (activeFilter === "Mais vendidos") return products.filter((product) => product.tag.includes("vendida"));
    if (activeFilter === "Limitados") return products.filter((product) => product.tag.includes("limitada"));
    return products.filter((product) => product.color === activeFilter);
  }, [activeFilter]);

  return (
    <section className="store-section page-shell">
      <div className="store-section-head">
        <div>
          <p>Compre ARCADE.CO</p>
          <h2>Camisetas masculinas</h2>
        </div>
        <button className="filter-button" type="button">
          <SlidersHorizontal size={18} />
          Filtrar
        </button>
      </div>

      <CategoryRail active={activeFilter} onChange={setActiveFilter} />

      <div className="commerce-grid">
        {filteredProducts.map((product) => (
          <ProductCard key={product.id} product={product} onAdd={onAdd} />
        ))}
      </div>
    </section>
  );
}

function ProductPage({ id, onAdd }) {
  const [size, setSize] = useState("M");
  const product = products.find((entry) => entry.id === id) || products[0];

  return (
    <section className="product-page page-shell" aria-label={product.name}>
      <button className="back-button" type="button" onClick={() => goTo("camisetas")}>Voltar para camisetas</button>
      <div className="product-modal product-page-grid">
        <div className="modal-image">
          <img src={product.image} alt={product.name} />
        </div>
        <div className="modal-info">
          <p>{product.category}</p>
          <h2>{product.name}</h2>
          <div className="price-row">
            <strong>{formatBRL(product.price)}</strong>
            <span>{formatBRL(product.oldPrice)}</span>
          </div>
          <p>{product.description}</p>
          <ul>
            <li>Produzida sob encomenda</li>
            <li>Ribana premium</li>
            <li>Logo discreta ARCADE.CO</li>
            <li>Atendimento e finalizacao pelo WhatsApp</li>
          </ul>
          <div className="size-row modal-sizes">
            {sizes.map((entry) => (
              <button className={size === entry ? "is-active" : ""} key={entry} type="button" onClick={() => setSize(entry)}>
                {entry}
              </button>
            ))}
          </div>
          <button className="add-button" type="button" onClick={() => onAdd(product.id, size)}>
            Adicionar a sacola
          </button>
        </div>
      </div>
    </section>
  );
}

function CartDrawer({ cart, open, onClose, onIncrease, onDecrease, onRemove }) {
  const subtotal = cart.reduce((sum, item) => {
    const product = products.find((entry) => entry.id === item.id);
    return sum + product.price * item.qty;
  }, 0);

  return (
    <>
      <div className={`cart-overlay ${open ? "is-open" : ""}`} onClick={onClose} />
      <aside className={`cart-drawer ${open ? "is-open" : ""}`} aria-hidden={!open}>
        <div className="cart-header">
          <div>
            <p>ARCADE.CO</p>
            <h2>Sacola</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Fechar sacola">
            <X size={22} />
          </button>
        </div>

        <div className="cart-items">
          {!cart.length && (
            <div className="empty-cart">
              <ShoppingBag size={34} />
              <p>Sua sacola esta vazia.</p>
              <span>Escolha uma peca, selecione o tamanho e finalize pelo WhatsApp.</span>
            </div>
          )}

          {cart.map((item) => {
            const product = products.find((entry) => entry.id === item.id);
            return (
              <article className="cart-item" key={`${item.id}-${item.size}`}>
                <img src={product.image} alt={product.name} />
                <div>
                  <h3>{product.name}</h3>
                  <p>Tamanho {item.size}</p>
                  <strong>{formatBRL(product.price * item.qty)}</strong>
                  <div className="qty-row">
                    <button type="button" onClick={() => onDecrease(item.id, item.size)} aria-label="Diminuir quantidade">
                      <Minus size={16} />
                    </button>
                    <span>{item.qty}</span>
                    <button type="button" onClick={() => onIncrease(item.id, item.size)} aria-label="Aumentar quantidade">
                      <Plus size={16} />
                    </button>
                    <button className="remove-item" type="button" onClick={() => onRemove(item.id, item.size)}>
                      Remover
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        <div className="cart-footer">
          <div className="subtotal">
            <span>Subtotal</span>
            <strong>{formatBRL(subtotal)}</strong>
          </div>
          <a className={`checkout-button ${!cart.length ? "is-disabled" : ""}`} href={buildWhatsappUrl(cart)} target="_blank" rel="noreferrer">
            Finalizar pelo WhatsApp
          </a>
        </div>
      </aside>
    </>
  );
}

function AboutPage() {
  return (
    <section className="brand-strip page-shell">
      <div>
        <h2>Nao foi feita para todos.</h2>
        <p>
          Cada peca e produzida sob encomenda para preservar aquilo que o mercado perdeu:
          exclusividade. Aqui voce nao compra uma camiseta. Voce veste a marca.
        </p>
      </div>
      <img src="/images/collage.png" alt="Pecas ARCADE.CO em preto e branco" />
    </section>
  );
}

function App() {
  const [cartOpen, setCartOpen] = useState(false);
  const [cart, setCart] = useState([]);
  const [route, setRoute] = useState(getRoute);

  useEffect(() => {
    const onHashChange = () => setRoute(getRoute());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const cartCount = cart.reduce((sum, item) => sum + item.qty, 0);

  const addToCart = (id, size) => {
    setCart((current) => {
      const existing = current.find((item) => item.id === id && item.size === size);
      if (existing) {
        return current.map((item) =>
          item.id === id && item.size === size ? { ...item, qty: item.qty + 1 } : item
        );
      }
      return [...current, { id, size, qty: 1 }];
    });
    setCartOpen(true);
  };

  const increase = (id, size) => {
    setCart((current) =>
      current.map((item) => (item.id === id && item.size === size ? { ...item, qty: item.qty + 1 } : item))
    );
  };

  const decrease = (id, size) => {
    setCart((current) =>
      current
        .map((item) => (item.id === id && item.size === size ? { ...item, qty: item.qty - 1 } : item))
        .filter((item) => item.qty > 0)
    );
  };

  const remove = (id, size) => {
    setCart((current) => current.filter((item) => item.id !== id || item.size !== size));
  };

  const renderPage = () => {
    if (route.page === "shop") return <ShopPage onAdd={addToCart} />;
    if (route.page === "product") return <ProductPage id={route.id} onAdd={addToCart} />;
    if (route.page === "about") return <AboutPage />;
    return <HomePage />;
  };

  return (
    <>
      <Header cartCount={cartCount} onCartOpen={() => setCartOpen(true)} />
      <main>{renderPage()}</main>
      <footer className="store-footer">
        <button className="logo logo-button footer-logo" type="button" onClick={() => goTo("")}>ARCADE<span>.</span>CO</button>
        <p>Elegancia sem excessos.</p>
        <span>Copyright © 2026 ARCADE.CO.</span>
      </footer>

      <CartDrawer
        cart={cart}
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        onIncrease={increase}
        onDecrease={decrease}
        onRemove={remove}
      />
    </>
  );
}

createRoot(document.getElementById("root")).render(<App />);
