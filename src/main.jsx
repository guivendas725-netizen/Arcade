import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { Heart, LogOut, Menu, Minus, Plus, Search, ShoppingBag, SlidersHorizontal, User, X } from "lucide-react";
import "./styles.css";

const phone = "5565992807604";
const sizes = ["P", "M", "G", "GG"];
const USERS_KEY = "arcade_users";
const CURRENT_USER_KEY = "arcade_current_user";
const ORDERS_KEY = "arcade_orders";
const OWNER_TOKEN_KEY = "arcade_owner_token";
const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL;
const productionApiBaseUrl = "https://arcade-api-sdxg.onrender.com";
const isOfficialDomain = window.location.hostname.includes("arcadecoficial.com.br");
const API_BASE_URL =
  configuredApiBaseUrl && configuredApiBaseUrl !== "VITE_API_BASE_URL"
    ? configuredApiBaseUrl
    : isOfficialDomain
      ? productionApiBaseUrl
      : "http://127.0.0.1:8787";
const paidStatus = "Pagamento confirmado";
const orderStatuses = ["Aguardando pagamento", paidStatus, "Em producao", "Enviado", "Entregue"];
const paymentMethods = ["PIX", "Cartao", "PayPal", "Outro"];

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

const capitalizeText = (value = "") =>
  value
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trimStart()
    .replace(/(^|\s)([a-zA-ZÀ-ÿ])/g, (match) => match.toUpperCase());

const readStorage = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key)) || fallback;
  } catch {
    return fallback;
  }
};

const writeStorage = (key, value) => {
  localStorage.setItem(key, JSON.stringify(value));
};

const emptyDeliveryInfo = {
  cep: "",
  street: "",
  number: "",
  complement: "",
  neighborhood: "",
  city: "",
  state: "",
  paymentMethod: "",
  confirmed: false,
};

const getDeliveryInfo = (user) => ({ ...emptyDeliveryInfo, ...(user?.delivery || {}) });

const formatDeliveryAddress = (delivery) => {
  const info = { ...emptyDeliveryInfo, ...delivery };
  const complement = info.complement ? `, ${capitalizeText(info.complement)}` : "";
  return `${capitalizeText(info.street)}, ${info.number}${complement} - ${capitalizeText(info.neighborhood)}, ${capitalizeText(info.city)}/${info.state}, CEP ${info.cep}`;
};

const buildWhatsappUrl = (cart, user, orderId) => {
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
  const delivery = getDeliveryInfo(user);

  return `https://wa.me/${phone}?text=${encodeURIComponent(
    `Ola, quero confirmar meu pedido ${orderId} da ARCADE.CO:\nCliente: ${user?.name || ""}\nTelefone: ${user?.phone || ""}\nEndereco: ${formatDeliveryAddress(delivery)}\nPagamento: ${delivery.paymentMethod}\n${lines.join("\n")}\nTotal: ${formatBRL(total)}`
  )}`;
};

const buildOwnerWhatsappUrl = (order) =>
  `https://wa.me/${order.userPhone.replace(/\D/g, "")}?text=${encodeURIComponent(
    `Ola, ${order.userName}. Seu pedido ${order.id} da ARCADE.CO esta com status: ${order.status}.`
  )}`;

const missingDeliveryFields = (user) => {
  const delivery = getDeliveryInfo(user);
  const fields = [];
  if (!user?.name?.trim()) fields.push("nome completo");
  if (!user?.phone?.trim()) fields.push("WhatsApp");
  if (!delivery.cep.trim()) fields.push("CEP");
  if (!delivery.street.trim()) fields.push("rua");
  if (!delivery.number.trim()) fields.push("numero");
  if (!delivery.neighborhood.trim()) fields.push("bairro");
  if (!delivery.city.trim()) fields.push("cidade");
  if (!delivery.state.trim()) fields.push("estado");
  if (!delivery.paymentMethod.trim()) fields.push("forma de pagamento");
  if (!delivery.confirmed) fields.push("confirmacao dos dados");
  return fields;
};

const getRoute = () => {
  const hash = window.location.hash.replace("#", "").split("?")[0];
  if (!hash || hash === "/") return { page: "home" };
  if (hash.startsWith("produto/")) return { page: "product", id: hash.split("/")[1] };
  if (hash === "camisetas") return { page: "shop" };
  if (hash === "sobre") return { page: "about" };
  if (hash === "login") return { page: "login" };
  if (hash === "conta") return { page: "account" };
  if (hash === "painel-lojista" || hash === "gestao") return { page: "admin" };
  return { page: "home" };
};

const getPaymentReturnMessage = () => {
  const hash = window.location.hash.replace("#", "");
  const query = hash.includes("?") ? hash.split("?")[1] : "";
  const params = new URLSearchParams(query);
  const payment = params.get("pagamento");

  if (payment === "confirmado") return "Pagamento confirmado. Seu pedido foi liberado para producao.";
  if (payment === "pendente") return "Pagamento recebido pelo PayPal, mas ainda esta pendente de confirmacao.";
  if (payment === "erro") return "Nao foi possivel confirmar o pagamento automaticamente. Confira no PayPal e no painel do lojista.";
  if (payment === "pedido-nao-encontrado") return "Pagamento retornou sem pedido correspondente. Verifique o painel do lojista.";
  return "";
};

const goTo = (hash) => {
  window.location.hash = hash;
  window.scrollTo({ top: 0, behavior: "smooth" });
};

function Header({ cartCount, currentUser, onCartOpen, onLogout }) {
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
          <button type="button" onClick={() => goTo(currentUser ? "conta" : "login")}>
            {currentUser ? "Minha conta" : "Login"}
          </button>
        </nav>

        {currentUser && (
          <button className="account-chip" type="button" onClick={onLogout} aria-label="Sair da conta">
            <User size={16} />
            <span>{capitalizeText(currentUser.name)?.split(" ")[0] || "Cliente"}</span>
            <LogOut size={15} />
          </button>
        )}

        <button className="bag-button" type="button" onClick={onCartOpen} aria-label="Abrir sacola">
          <ShoppingBag size={21} />
          <span>{cartCount}</span>
        </button>
      </div>

      <button
        className={`mobile-menu-backdrop ${menuOpen ? "is-open" : ""}`}
        type="button"
        onClick={() => setMenuOpen(false)}
        aria-label="Fechar menu"
      />

      <div className={`mobile-menu ${menuOpen ? "is-open" : ""}`}>
        <button className="icon-button close-menu" type="button" onClick={() => setMenuOpen(false)} aria-label="Fechar menu">
          <X size={22} />
        </button>
        <button type="button" onClick={() => { setMenuOpen(false); goTo(""); }}>Inicio</button>
        <button type="button" onClick={() => { setMenuOpen(false); goTo("camisetas"); }}>Camisetas</button>
        <button type="button" onClick={() => { setMenuOpen(false); goTo("sobre"); }}>Marca</button>
        <button type="button" onClick={() => { setMenuOpen(false); goTo(currentUser ? "conta" : "login"); }}>
          {currentUser ? "Minha conta" : "Login"}
        </button>
        {currentUser && <button type="button" onClick={onLogout}>Sair</button>}
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

      <div className="atelier-strip">
        <article>
          <span>01</span>
          <strong>Sob encomenda</strong>
          <p>A peca entra em producao somente apos pagamento confirmado.</p>
        </article>
        <article>
          <span>02</span>
          <strong>Baixa quantidade</strong>
          <p>Sem estoque em massa, sem reposicao infinita, sem excesso.</p>
        </article>
        <article>
          <span>03</span>
          <strong>Presenca limpa</strong>
          <p>Caimento elegante, textura premium e logo discreta.</p>
        </article>
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

function CartDrawer({ cart, currentUser, open, processingCheckout, onClose, onCheckout, onIncrease, onDecrease, onRemove }) {
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
          {!currentUser && cart.length > 0 && (
            <p className="cart-login-note">Entre ou cadastre-se para salvar o pedido na sua conta.</p>
          )}
          {!cart.length && (
            <p className="cart-empty-note">Adicione uma peca a sacola para liberar a finalizacao.</p>
          )}
          <button className={`checkout-button ${!cart.length ? "is-disabled" : ""}`} type="button" onClick={onCheckout} disabled={!cart.length || processingCheckout}>
            {processingCheckout ? "Criando pedido..." : currentUser ? "Finalizar pedido" : "Entrar para finalizar"}
          </button>
          {currentUser && cart.length > 0 && (
            <p className="cart-empty-note">Pedidos sob encomenda so entram em producao apos confirmacao do pagamento.</p>
          )}
        </div>
      </aside>
    </>
  );
}

function AuthPage({ onAuth }) {
  const [mode, setMode] = useState("login");
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
  });

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const submit = (event) => {
    event.preventDefault();
    const users = readStorage(USERS_KEY, []);
    const email = form.email.trim().toLowerCase();

    if (mode === "register") {
      if (!form.name || !email || !form.phone || !form.password) {
        setMessage("Preencha todos os campos para criar sua conta.");
        return;
      }
      if (users.some((user) => user.email === email)) {
        setMessage("Ja existe uma conta com esse e-mail.");
        return;
      }
      const newUser = {
        id: `USR-${Date.now()}`,
        name: form.name.trim(),
        email,
        phone: form.phone.trim(),
        address: "",
        delivery: emptyDeliveryInfo,
        password: form.password,
      };
      const nextUsers = [...users, newUser];
      writeStorage(USERS_KEY, nextUsers);
      onAuth(newUser);
      goTo("conta");
      return;
    }

    const existing = users.find((user) => user.email === email && user.password === form.password);
    if (!existing) {
      setMessage("E-mail ou senha invalidos.");
      return;
    }
    onAuth(existing);
    goTo("conta");
  };

  return (
    <section className="auth-page page-shell">
      <div className="auth-card">
        <div>
          <p>ARCADE.CO</p>
          <h1>{mode === "login" ? "Entrar na conta" : "Criar cadastro"}</h1>
          <span>Salve seus dados, acompanhe pedidos e veja quando sua peca for enviada.</span>
        </div>

        <div className="auth-tabs">
          <button className={mode === "login" ? "is-active" : ""} type="button" onClick={() => setMode("login")}>Login</button>
          <button className={mode === "register" ? "is-active" : ""} type="button" onClick={() => setMode("register")}>Cadastro</button>
        </div>

        <form className="auth-form" onSubmit={submit}>
          {mode === "register" && (
            <>
              <label>
                Nome completo
                <input value={form.name} onChange={(event) => updateField("name", event.target.value)} />
              </label>
              <label>
                WhatsApp
                <input value={form.phone} onChange={(event) => updateField("phone", event.target.value)} />
              </label>
            </>
          )}
          <label>
            E-mail
            <input type="email" value={form.email} onChange={(event) => updateField("email", event.target.value)} />
          </label>
          <label>
            Senha
            <input type="password" value={form.password} onChange={(event) => updateField("password", event.target.value)} />
          </label>
          {message && <p className="form-message">{message}</p>}
          <button className="add-button" type="submit">
            {mode === "login" ? "Entrar" : "Criar conta"}
          </button>
        </form>
      </div>
    </section>
  );
}

function OrderProgress({ status }) {
  const currentIndex = Math.max(orderStatuses.indexOf(status), 0);

  return (
    <div className="order-progress" aria-label={`Status atual: ${status}`}>
      {orderStatuses.map((entry, index) => {
        const isCurrent = index === currentIndex;
        const isPast = index < currentIndex;
        const isProduction = entry === "Em producao" && isCurrent;
        return (
          <div className={`progress-step ${isCurrent ? "is-current" : ""} ${isPast ? "is-past" : ""}`} key={entry}>
            <span className="progress-dot" aria-hidden="true" />
            <div className="progress-copy">
              <span>{entry}</span>
              {isProduction && <small>Postagem estimada em 7 a 12 dias uteis.</small>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AccountPage({ currentUser, orders, onUpdateDelivery }) {
  const [deliveryForm, setDeliveryForm] = useState({
    name: currentUser?.name || "",
    phone: currentUser?.phone || "",
    ...getDeliveryInfo(currentUser),
  });
  const [deliveryMessage, setDeliveryMessage] = useState("");

  useEffect(() => {
    setDeliveryForm({
      name: currentUser?.name || "",
      phone: currentUser?.phone || "",
      ...getDeliveryInfo(currentUser),
    });
  }, [currentUser]);

  if (!currentUser) {
    return (
      <section className="auth-page page-shell">
        <div className="auth-card">
          <p>Minha conta</p>
          <h1>Entre para acompanhar seus pedidos.</h1>
          <button className="add-button" type="button" onClick={() => goTo("login")}>Fazer login</button>
        </div>
      </section>
    );
  }

  const userOrders = orders.filter((order) => order.userEmail === currentUser.email);
  const missingFields = missingDeliveryFields(currentUser);
  const deliveryIsComplete = missingFields.length === 0;

  const updateDeliveryField = (field, value) => {
    const shouldCapitalize = ["name", "street", "neighborhood", "city"].includes(field);
    setDeliveryForm((current) => ({ ...current, [field]: shouldCapitalize ? capitalizeText(value) : value }));
  };

  const saveDeliveryInfo = (event) => {
    event.preventDefault();
    const nextDelivery = {
      name: capitalizeText(deliveryForm.name),
      phone: deliveryForm.phone.trim(),
      cep: deliveryForm.cep.trim(),
      street: capitalizeText(deliveryForm.street),
      number: deliveryForm.number.trim(),
      complement: deliveryForm.complement.trim(),
      neighborhood: capitalizeText(deliveryForm.neighborhood),
      city: capitalizeText(deliveryForm.city),
      state: deliveryForm.state.trim().toUpperCase(),
      paymentMethod: deliveryForm.paymentMethod.trim(),
      confirmed: deliveryForm.confirmed,
    };
    const missing = missingDeliveryFields({ ...currentUser, name: nextDelivery.name, phone: nextDelivery.phone, delivery: nextDelivery });
    if (missing.length) {
      setDeliveryMessage(`Preencha: ${missing.join(", ")}.`);
      return;
    }
    onUpdateDelivery(nextDelivery);
    setDeliveryMessage("Informacoes de entrega salvas na sua conta.");
  };

  return (
    <section className="account-page page-shell">
      <div className="account-head">
        <div>
          <p>Minha conta</p>
          <h1>Ola, {capitalizeText(currentUser.name)?.split(" ")[0] || "Cliente"}.</h1>
          <span>{currentUser.email} · {currentUser.phone}</span>
        </div>
        <button className="shop-link" type="button" onClick={() => goTo("camisetas")}>Comprar mais</button>
      </div>

      {getPaymentReturnMessage() && <p className="payment-return-message">{getPaymentReturnMessage()}</p>}

      <div className="profile-grid">
        <article className="profile-card">
          <h2>Entrega do pedido</h2>
          {!deliveryIsComplete && (
            <p className="delivery-warning">
              Complete seus dados de entrega antes de finalizar qualquer pedido.
            </p>
          )}
          <p><strong>Nome:</strong> {capitalizeText(currentUser.name)}</p>
          <p><strong>WhatsApp:</strong> {currentUser.phone}</p>
          <p><strong>Entrega:</strong> {deliveryIsComplete ? formatDeliveryAddress(getDeliveryInfo(currentUser)) : "Ainda nao informado"}</p>
          <p><strong>Pagamento:</strong> {getDeliveryInfo(currentUser).paymentMethod || "Ainda nao informado"}</p>

          <form className="shipping-form" onSubmit={saveDeliveryInfo}>
            <label>
              Nome completo
              <input
                value={deliveryForm.name}
                onChange={(event) => updateDeliveryField("name", event.target.value)}
                placeholder="Nome de quem vai receber"
              />
            </label>
            <label>
              WhatsApp
              <input
                value={deliveryForm.phone}
                onChange={(event) => updateDeliveryField("phone", event.target.value)}
                placeholder="Numero para contato da entrega"
              />
            </label>

            <div className="form-divider">
              <span>Endereco de entrega</span>
            </div>

            <label>
              CEP
              <input
                value={deliveryForm.cep}
                onChange={(event) => updateDeliveryField("cep", event.target.value)}
                placeholder="00000-000"
              />
            </label>
            <label>
              Rua
              <input
                value={deliveryForm.street}
                onChange={(event) => updateDeliveryField("street", event.target.value)}
                placeholder="Nome da rua ou avenida"
              />
            </label>
            <div className="shipping-row">
              <label>
                Numero
                <input
                  value={deliveryForm.number}
                  onChange={(event) => updateDeliveryField("number", event.target.value)}
                  placeholder="123"
                />
              </label>
              <label>
                Complemento (opcional)
                <input
                  value={deliveryForm.complement}
                  onChange={(event) => updateDeliveryField("complement", event.target.value)}
                  placeholder="Apto, bloco, casa"
                />
              </label>
            </div>
            <label>
              Bairro
              <input
                value={deliveryForm.neighborhood}
                onChange={(event) => updateDeliveryField("neighborhood", event.target.value)}
                placeholder="Bairro"
              />
            </label>
            <div className="shipping-row">
              <label>
                Cidade
                <input
                  value={deliveryForm.city}
                  onChange={(event) => updateDeliveryField("city", event.target.value)}
                  placeholder="Cidade"
                />
              </label>
              <label>
                Estado
                <input
                  value={deliveryForm.state}
                  onChange={(event) => updateDeliveryField("state", event.target.value)}
                  placeholder="UF"
                  maxLength={2}
                />
              </label>
            </div>

            <div className="form-divider">
              <span>Forma de pagamento</span>
            </div>

            <div className="payment-options" aria-label="Forma de pagamento">
              {paymentMethods.map((method) => (
                <button
                  className={deliveryForm.paymentMethod === method ? "is-active" : ""}
                  key={method}
                  type="button"
                  onClick={() => updateDeliveryField("paymentMethod", method)}
                >
                  {method}
                </button>
              ))}
            </div>

            <label className="confirm-check">
              <input
                type="checkbox"
                checked={deliveryForm.confirmed}
                onChange={(event) => updateDeliveryField("confirmed", event.target.checked)}
              />
              Confirmo que as informacoes de entrega e pagamento estao corretas.
            </label>
            {deliveryMessage && <p className="form-message">{deliveryMessage}</p>}
            <button className="add-button" type="submit">Salvar dados de entrega</button>
          </form>
        </article>

        <article className="orders-panel">
          <h2>Meus pedidos</h2>
          {!userOrders.length && (
            <div className="empty-orders">
              <ShoppingBag size={32} />
              <p>Voce ainda nao tem pedidos salvos.</p>
            </div>
          )}
          {userOrders.map((order) => (
            <div className="order-card" key={order.id}>
              <div className="order-top">
                <div>
                  <strong>{order.id}</strong>
                  <span>{new Date(order.createdAt).toLocaleDateString("pt-BR")}</span>
                </div>
                <b>{formatBRL(order.total)}</b>
              </div>
              <OrderProgress status={order.status} />
              {order.paymentMethod && <p className="order-payment">Pagamento: {order.paymentMethod}</p>}
              <ul>
                {order.items.map((item) => {
                  const product = products.find((entry) => entry.id === item.id);
                  return <li key={`${order.id}-${item.id}-${item.size}`}>{product?.name || item.name} · {item.size} · qtd {item.qty}</li>;
                })}
              </ul>
            </div>
          ))}
        </article>
      </div>
    </section>
  );
}

function OwnerPanelPage({ orders, ownerToken, onOwnerLogin, onOwnerLogout, onStatusChange }) {
  const [unlocked, setUnlocked] = useState(() => Boolean(ownerToken));
  const [credentials, setCredentials] = useState({ email: "", password: "" });
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("Todos");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setUnlocked(Boolean(ownerToken));
  }, [ownerToken]);

  const openPanel = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    const result = await onOwnerLogin(credentials);
    setLoading(false);

    if (!result.ok) {
      setError(result.error || "Login ou senha incorretos.");
      return;
    }

    setUnlocked(true);
  };

  const closePanel = () => {
    setUnlocked(false);
    onOwnerLogout();
  };

  const filteredOrders = orders.filter((order) => {
    const haystack = `${order.id} ${order.userName} ${order.userEmail} ${order.userPhone} ${order.userAddress} ${order.paymentMethod || ""}`.toLowerCase();
    const matchesQuery = haystack.includes(query.trim().toLowerCase());
    const matchesStatus = statusFilter === "Todos" || order.status === statusFilter;
    return matchesQuery && matchesStatus;
  });

  const statusTotals = orderStatuses.map((status) => ({
    status,
    total: orders.filter((order) => order.status === status).length,
  }));

  if (!unlocked) {
    return (
      <section className="owner-login page-shell">
        <form className="auth-card owner-access-card" onSubmit={openPanel}>
          <div>
            <p>Painel do lojista</p>
            <h1>Login do lojista.</h1>
            <span>Entre com e-mail e senha para atualizar o acompanhamento dos clientes.</span>
          </div>
          <label>
            E-mail
            <input
              type="email"
              value={credentials.email}
              onChange={(event) => setCredentials((current) => ({ ...current, email: event.target.value }))}
              placeholder="E-mail"
            />
          </label>
          <label>
            Senha
            <input
              type="password"
              value={credentials.password}
              onChange={(event) => setCredentials((current) => ({ ...current, password: event.target.value }))}
              placeholder="Senha"
            />
          </label>
          {error && <p className="form-message">{error}</p>}
          <button className="add-button" type="submit" disabled={loading}>
            {loading ? "Verificando..." : "Entrar no painel"}
          </button>
        </form>
      </section>
    );
  }

  return (
    <section className="owner-panel page-shell">
      <div className="owner-panel-head">
        <div>
          <p>Painel do lojista</p>
          <h1>Acompanhamento de pedidos</h1>
          <span>Pedidos entram como aguardando pagamento e so devem ir para producao depois da confirmacao no PayPal, PIX, cartao ou banco.</span>
        </div>
        <button className="filter-button" type="button" onClick={closePanel}>Bloquear painel</button>
      </div>

      <div className="owner-stats">
        <article>
          <span>Total</span>
          <strong>{orders.length}</strong>
        </article>
        {statusTotals.map((entry) => (
          <article key={entry.status}>
            <span>{entry.status}</span>
            <strong>{entry.total}</strong>
          </article>
        ))}
      </div>

      <div className="owner-toolbar">
        <label>
          Buscar cliente ou pedido
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nome, telefone, e-mail ou codigo" />
        </label>
        <label>
          Filtrar por status
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option>Todos</option>
            {orderStatuses.map((status) => <option key={status}>{status}</option>)}
          </select>
        </label>
      </div>

      <div className="owner-orders">
        {!filteredOrders.length && <p className="form-message">Nenhum pedido encontrado.</p>}
        {filteredOrders.map((order) => (
          <article className="owner-order-card" key={order.id}>
            <div className="owner-order-main">
              <div className="order-top">
                <div>
                  <strong>{order.id}</strong>
                  <span>{new Date(order.createdAt).toLocaleString("pt-BR")}</span>
                </div>
                <b>{formatBRL(order.total)}</b>
              </div>

              <div className="customer-box">
                <p><strong>Cliente:</strong> {capitalizeText(order.userName)}</p>
                <p><strong>E-mail:</strong> {order.userEmail}</p>
                <p><strong>WhatsApp:</strong> {order.userPhone}</p>
                <p><strong>Entrega:</strong> {order.userAddress}</p>
                <p><strong>Pagamento:</strong> {order.paymentMethod || "Nao informado"}</p>
                <p><strong>Situacao do pagamento:</strong> {order.paymentStatus === "CONFIRMED" ? "Confirmado" : "Aguardando confirmacao"}</p>
              </div>

              <ul>
                {order.items.map((item) => {
                  const product = products.find((entry) => entry.id === item.id);
                  return <li key={`${order.id}-${item.id}-${item.size}`}>{product?.name || item.name} · tamanho {item.size} · qtd {item.qty}</li>;
                })}
              </ul>
            </div>

            <aside className="owner-order-actions">
              <label>
                Situacao do pedido
                <select value={order.status} onChange={(event) => onStatusChange(order.id, event.target.value)}>
                  {orderStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
                </select>
              </label>
              <OrderProgress status={order.status} />
              <a className="checkout-button" href={buildOwnerWhatsappUrl(order)} target="_blank" rel="noreferrer">
                Avisar cliente
              </a>
            </aside>
          </article>
        ))}
      </div>
    </section>
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
  const [currentUser, setCurrentUser] = useState(() => readStorage(CURRENT_USER_KEY, null));
  const [orders, setOrders] = useState(() => readStorage(ORDERS_KEY, []));
  const [processingCheckout, setProcessingCheckout] = useState(false);
  const [ownerToken, setOwnerToken] = useState(() => readStorage(OWNER_TOKEN_KEY, ""));

  useEffect(() => {
    const onHashChange = () => setRoute(getRoute());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    const loadOrders = async () => {
      if (!currentUser?.email) {
        setOrders([]);
        writeStorage(ORDERS_KEY, []);
        return;
      }

      try {
        const response = await fetch(`${API_BASE_URL}/api/orders?email=${encodeURIComponent(currentUser.email)}`);
        if (!response.ok) return;
        const serverOrders = await response.json();
        setOrders(serverOrders);
        writeStorage(ORDERS_KEY, serverOrders);
      } catch {
        // Keeps the storefront usable while the backend is not running locally.
      }
    };

    loadOrders();
  }, [currentUser?.email]);

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

  const loginUser = (user) => {
    setCurrentUser(user);
    writeStorage(CURRENT_USER_KEY, user);
  };

  const updateDeliveryInfo = (deliveryInfo) => {
    const delivery = {
      cep: deliveryInfo.cep.trim(),
      street: capitalizeText(deliveryInfo.street),
      number: deliveryInfo.number.trim(),
      complement: capitalizeText(deliveryInfo.complement),
      neighborhood: capitalizeText(deliveryInfo.neighborhood),
      city: capitalizeText(deliveryInfo.city),
      state: deliveryInfo.state.trim().toUpperCase(),
      paymentMethod: deliveryInfo.paymentMethod.trim(),
      confirmed: deliveryInfo.confirmed,
    };
    const nextUser = {
      ...currentUser,
      name: capitalizeText(deliveryInfo.name),
      phone: deliveryInfo.phone.trim(),
      address: formatDeliveryAddress(delivery),
      delivery,
    };
    const users = readStorage(USERS_KEY, []);
    const userExists = users.some((user) => user.email === nextUser.email);
    const nextUsers = userExists
      ? users.map((user) => (user.email === nextUser.email ? nextUser : user))
      : [...users, nextUser];
    setCurrentUser(nextUser);
    writeStorage(CURRENT_USER_KEY, nextUser);
    writeStorage(USERS_KEY, nextUsers);
  };

  const logoutUser = () => {
    setCurrentUser(null);
    setOrders([]);
    localStorage.removeItem(CURRENT_USER_KEY);
    localStorage.removeItem(ORDERS_KEY);
    goTo("login");
  };

  const fetchOwnerOrders = async (token = ownerToken) => {
    if (!token) return { ok: false, error: "Acesso do lojista expirado." };

    const response = await fetch(`${API_BASE_URL}/api/admin/orders`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      setOwnerToken("");
      localStorage.removeItem(OWNER_TOKEN_KEY);
      return { ok: false, error: data.error || "Nao foi possivel carregar os pedidos." };
    }

    setOrders(data);
    writeStorage(ORDERS_KEY, data);
    return { ok: true };
  };

  const ownerLogin = async (credentials) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: credentials.email.trim(),
          password: credentials.password,
        }),
      });
      const data = await response.json();

      if (!response.ok || !data.token) {
        return { ok: false, error: data.error || "Login ou senha incorretos." };
      }

      setOwnerToken(data.token);
      writeStorage(OWNER_TOKEN_KEY, data.token);
      return fetchOwnerOrders(data.token);
    } catch {
      return { ok: false, error: "Servidor indisponivel. Inicie a API para acessar o painel." };
    }
  };

  const ownerLogout = () => {
    setOwnerToken("");
    localStorage.removeItem(OWNER_TOKEN_KEY);
  };

  useEffect(() => {
    if (route.page === "admin" && ownerToken) {
      fetchOwnerOrders(ownerToken);
    }
  }, [route.page, ownerToken]);

  const checkout = async () => {
    if (!cart.length) return;
    if (!currentUser) {
      setCartOpen(false);
      goTo("login");
      return;
    }
    const missingFields = missingDeliveryFields(currentUser);
    if (missingFields.length) {
      setCartOpen(false);
      window.alert(`Preencha as informacoes de entrega antes de finalizar: ${missingFields.join(", ")}.`);
      goTo("conta");
      return;
    }

    setProcessingCheckout(true);
    try {
      const enrichedItems = cart.map((item) => {
        const product = products.find((entry) => entry.id === item.id);
        return {
          ...item,
          name: product.name,
          price: product.price,
        };
      });
      const response = await fetch(`${API_BASE_URL}/api/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer: {
            email: currentUser.email,
            name: capitalizeText(currentUser.name),
            phone: currentUser.phone,
            address: formatDeliveryAddress(getDeliveryInfo(currentUser)),
          },
          delivery: getDeliveryInfo(currentUser),
          paymentMethod: getDeliveryInfo(currentUser).paymentMethod,
          items: enrichedItems,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        window.alert(data.error || "Nao foi possivel criar o pedido.");
        return;
      }

      const nextOrders = [data.order, ...orders.filter((order) => order.id !== data.order.id)];
      setOrders(nextOrders);
      writeStorage(ORDERS_KEY, nextOrders);
      setCart([]);
      setCartOpen(false);

      if (data.approvalUrl) {
        window.location.href = data.approvalUrl;
        return;
      }

      window.alert(data.message || "Pedido criado aguardando confirmacao do pagamento.");
      goTo("conta");
    } catch {
      window.alert("O servidor de pagamentos nao esta disponivel. Inicie o backend para finalizar pedidos reais.");
    } finally {
      setProcessingCheckout(false);
    }
  };

  const updateOrderStatus = async (orderId, status) => {
    if (!ownerToken) {
      window.alert("Entre novamente no painel do lojista para alterar pedidos.");
      return;
    }

    const order = orders.find((entry) => entry.id === orderId);
    const paidIndex = orderStatuses.indexOf(paidStatus);
    const selectedIndex = orderStatuses.indexOf(status);

    if (selectedIndex > paidIndex && order?.paymentStatus !== "CONFIRMED" && order?.status !== paidStatus) {
      window.alert("Este pedido ainda nao teve pagamento confirmado. Ele nao pode ir para producao.");
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/orders/${orderId}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({ status }),
      });
      const data = await response.json();

      if (!response.ok) {
        window.alert(data.error || "Nao foi possivel atualizar o pedido.");
        return;
      }

      const nextOrders = orders.map((entry) => (entry.id === orderId ? data : entry));
      setOrders(nextOrders);
      writeStorage(ORDERS_KEY, nextOrders);
    } catch {
      window.alert("Servidor indisponivel. Nao foi possivel atualizar o pedido com seguranca.");
    }
  };

  const renderPage = () => {
    if (route.page === "shop") return <ShopPage onAdd={addToCart} />;
    if (route.page === "product") return <ProductPage id={route.id} onAdd={addToCart} />;
    if (route.page === "about") return <AboutPage />;
    if (route.page === "login") return <AuthPage onAuth={loginUser} />;
    if (route.page === "account") return <AccountPage currentUser={currentUser} orders={orders} onUpdateDelivery={updateDeliveryInfo} />;
    if (route.page === "admin") {
      return (
        <OwnerPanelPage
          orders={orders}
          ownerToken={ownerToken}
          onOwnerLogin={ownerLogin}
          onOwnerLogout={ownerLogout}
          onStatusChange={updateOrderStatus}
        />
      );
    }
    return <HomePage />;
  };

  return (
    <>
      <Header cartCount={cartCount} currentUser={currentUser} onCartOpen={() => setCartOpen(true)} onLogout={logoutUser} />
      <main>{renderPage()}</main>
      <footer className="store-footer">
        <button className="logo logo-button footer-logo" type="button" onClick={() => goTo("")}>ARCADE<span>.</span>CO</button>
        <p>Elegancia sem excessos.</p>
        <span>Copyright © 2026 ARCADE.CO.</span>
      </footer>

      <CartDrawer
        cart={cart}
        currentUser={currentUser}
        processingCheckout={processingCheckout}
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        onCheckout={checkout}
        onIncrease={increase}
        onDecrease={decrease}
        onRemove={remove}
      />
    </>
  );
}

createRoot(document.getElementById("root")).render(<App />);
