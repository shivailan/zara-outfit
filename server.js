const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const axios = require('axios');
const path = require('path');
const app = express();
const cheerio = require('cheerio');

// Middleware de protection
const requireAuth = (req, res, next) => {
    if (!req.session.userId) {
        return res.redirect('/login');
    }
    next();
};

// --- CONFIGURATION ---
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true })); 
app.use(express.json()); 

app.use(session({
    secret: 'zara_secret_key_2026',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 3600000 } 
}));

// --- MONGODB ---
mongoose.connect('mongodb://127.0.0.1:27017/zara_studio')
    .then(() => console.log('✅ MongoDB Connecté'))
    .catch(err => console.error('❌ Erreur de connexion MongoDB :', err));

// --- MODÈLES ---
const User = mongoose.model('User', new mongoose.Schema({
    username: { type: String, required: true, unique: true, trim: true },
    password: { type: String, required: true }
}));

const Outfit = mongoose.model('Outfit', new mongoose.Schema({
    creator: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    items: Array,
    totalPrice: Number,
    createdAt: { type: Date, default: Date.now }
}));

// --- ROUTES AUTHENTIFICATION ---

app.get('/register', (req, res) => res.render('register', { error: null }));

app.post('/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        const existingUser = await User.findOne({ username: username.toLowerCase() });
        if (existingUser) return res.render('register', { error: "Utilisateur déjà existant." });

        const hashedPassword = await bcrypt.hash(password, 10);
        await User.create({ username: username.toLowerCase(), password: hashedPassword });
        res.redirect('/login');
    } catch (e) {
        res.render('register', { error: "Erreur technique." });
    }
});

app.post('/studio/import-link', async (req, res) => {
    const { url } = req.body;
    try {
        const response = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0' } // Simule un navigateur
        });
        const $ = cheerio.load(response.data);

        // Tentative de récupération des données (balises OpenGraph standards)
        const image = $('meta[property="og:image"]').attr('content');
        const title = $('meta[property="og:title"]').attr('content') || "Article Externe";
        
        // Le prix est plus dur à trouver, on cherche des balises courantes
        let price = $('meta[property="og:price:amount"]').attr('content') || 
                    $('meta[property="product:price:amount"]').attr('content') || "0";

        if (!image) return res.json({ success: false, error: "Image introuvable" });

        res.json({
            success: true,
            item: {
                img: image,
                price: parseFloat(price),
                name: title,
                link: url // On garde le lien original
            }
        });
    } catch (error) {
        res.json({ success: false, error: "Impossible de lire ce site" });
    }
});

// --- GESTION DES OUTFITS ---

// Route pour supprimer un outfit
app.post('/outfits/delete/:id', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ success: false });

    try {
        // On vérifie que celui qui supprime est bien le créateur
        const outfit = await Outfit.findOne({ _id: req.params.id, creator: req.session.userId });
        if (!outfit) return res.status(403).json({ success: false, error: "Non autorisé" });

        await Outfit.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false });
    }
});

// Route pour charger un outfit existant dans le studio (Modifier)
app.get('/studio/edit/:id', async (req, res) => {
    if (!req.session.userId) return res.redirect('/login');

    try {
        const outfit = await Outfit.findOne({ _id: req.params.id, creator: req.session.userId });
        if (!outfit) return res.redirect('/outfits');

        // On renvoie la page studio avec une variable spéciale "editData"
        res.render('studio', { 
            isLoggedIn: true,
            user: req.session.username,
            userId: req.session.userId,
            currentCat: 'studio',
            editData: JSON.stringify(outfit.items) // On passe les articles pour le localStorage
        });
    } catch (e) {
        res.redirect('/outfits');
    }
});

// Route pour voir TOUS les outfits (Public)
app.get('/outfits', async (req, res) => {
    try {
        // On récupère tous les outfits et on lie le nom du créateur
        const allOutfits = await Outfit.find().populate('creator', 'username').sort({ createdAt: -1 });
        
        res.render('outfits', { 
            outfits: allOutfits,
            // Variables indispensables pour la navbar
            isLoggedIn: !!req.session.userId,
            user: req.session.username || "",
            userId: req.session.userId || "",
            currentCat: 'outfits' 
        });
    } catch (e) {
        console.error("Erreur galerie :", e);
        res.status(500).send("Erreur lors de la récupération des looks.");
    }
});



app.get('/login', (req, res) => res.render('login', { error: null }));

app.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username: username.toLowerCase() });
        if (user && await bcrypt.compare(password, user.password)) {
            req.session.userId = user._id;
            req.session.username = user.username;
            res.redirect('/');
        } else {
            res.render('login', { error: "Identifiants incorrects." });
        }
    } catch (e) {
        res.render('login', { error: "Erreur de connexion." });
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

// --- ROUTES PRINCIPALES ---

// 1. Catalogue (Accueil)
app.get('/', async (req, res) => {
    const catId = req.query.cat || '7616';
    const RAPID_API_KEY = '97af797614mshae0c725bcec0efcp167d4fjsn198baaaf1ee2';
    
    try {
        const response = await axios.get('https://asos2.p.rapidapi.com/products/v2/list', {
            params: { store: 'FR', offset: '0', categoryId: catId, limit: '20', country: 'FR', currency: 'EUR', lang: 'fr-FR' },
            headers: { 'x-rapidapi-key': RAPID_API_KEY, 'x-rapidapi-host': 'asos2.p.rapidapi.com' }
        });
        
const products = response.data.products.map(p => ({
    id: p.id, // Vérifie bien que c'est un nombre court (ex: 12345678)
    name: p.name,
    priceValue: p.price.current.value,
    priceText: p.price.current.text,
    image: "https://" + p.imageUrl
}));

        res.render('index', { 
            products, currentCat: catId, 
            isLoggedIn: !!req.session.userId,
            user: req.session.username || "",
            userId: req.session.userId || "" 
        });
    } catch (error) {
        res.render('index', { products: [], currentCat: catId, isLoggedIn: !!req.session.userId, user: "", userId: "" });
    }
});

// Seul un utilisateur connecté peut VOIR le studio
// Route Studio : Protégée (Redirige vers login si pas connecté)
app.get('/studio', (req, res) => {
    if (!req.session.userId) {
        return res.redirect('/login');
    }
    res.render('studio', { 
        isLoggedIn: true,
        user: req.session.username,
        userId: req.session.userId,
        currentCat: 'studio'
    });
});

// 3. SAUVEGARDE OUTFIT
app.post('/studio/save', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ success: false, error: "Non connecté" });

    try {
        const { items, totalPrice } = req.body;
        await Outfit.create({
            creator: req.session.userId,
            items: items,
            totalPrice: totalPrice
        });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false });
    }
});

app.listen(3000, () => console.log('🚀 Studio Zara lancé sur http://localhost:3000'));