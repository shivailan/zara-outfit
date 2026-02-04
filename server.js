const express = require('express');
const axios = require('axios');
const mongoose = require('mongoose');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const app = express();

// --- CONFIGURATION ---
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true })); // Pour lire les formulaires
app.use(express.json()); // Pour lire le JSON (sauvegarde studio)

// Configuration des sessions
app.use(session({
    secret: 'zara_studio_secret_key',
    resave: false,
    saveUninitialized: false
}));

// --- MONGODB ---
mongoose.connect('mongodb://127.0.0.1:27017/zara_studio')
    .then(() => console.log('✅ MongoDB Connecté'))
    .catch(err => console.error('❌ Erreur MongoDB:', err));

// Modèle Utilisateur
const User = mongoose.model('User', new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true }
}));

// Modèle Outfit (Tenue)
const Outfit = mongoose.model('Outfit', new mongoose.Schema({
    creatorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Optionnel si on autorise les non-connectés
    items: [{
        img: String,
        price: Number,
        x: Number,
        y: Number
    }],
    totalPrice: Number,
    createdAt: { type: Date, default: Date.now }
}));

// --- ROUTES AUTHENTIFICATION ---

app.get('/register', (req, res) => res.render('register'));

app.post('/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);
        await User.create({ username, password: hashedPassword });
        res.redirect('/login');
    } catch (e) {
        res.send("Erreur : Nom d'utilisateur déjà pris.");
    }
});

app.get('/login', (req, res) => res.render('login'));

app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (user && await bcrypt.compare(password, user.password)) {
        req.session.userId = user._id;
        res.redirect('/');
    } else {
        res.send("Identifiants incorrects.");
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

// --- ROUTES PRINCIPALES ---

app.get('/', async (req, res) => {
    const catId = req.query.cat || '7616'; 
    const RAPID_API_KEY = '97af797614mshae0c725bcec0efcp167d4fjsn198baaaf1ee2'; 
    
    const options = {
        method: 'GET',
        url: 'https://asos2.p.rapidapi.com/products/v2/list',
        params: { store: 'FR', offset: '0', categoryId: catId, limit: '20', country: 'FR', currency: 'EUR', lang: 'fr-FR' },
        headers: { 'x-rapidapi-key': RAPID_API_KEY, 'x-rapidapi-host': 'asos2.p.rapidapi.com' }
    };

    try {
        const response = await axios.request(options);
        const products = response.data.products.map(p => ({
            name: p.name,
            priceValue: p.price.current.value, 
            priceText: p.price.current.text,
            image: "https://" + p.imageUrl
        }));
        
        // Correction : On envoie products et isLoggedIn
        res.render('index', { 
            products, 
            currentCat: catId, 
            isLoggedIn: !!req.session.userId 
        });
    } catch (error) {
        // Correction de l'erreur de référence products en cas d'échec API
        res.render('index', { 
            products: [], 
            currentCat: catId, 
            isLoggedIn: !!req.session.userId 
        });
    }
});

app.get('/studio', (req, res) => {
    res.render('studio', { isLoggedIn: !!req.session.userId });
});

// Route pour sauvegarder une tenue en base de données
app.post('/studio/save', async (req, res) => {
    try {
        const { items, totalPrice } = req.body;
        const newOutfit = await Outfit.create({
            creatorId: req.session.userId || null, // null si l'utilisateur n'est pas connecté
            items,
            totalPrice
        });
        res.json({ success: true, outfitId: newOutfit._id });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Route pour voir toutes les tenues (public)
app.get('/outfits', async (req, res) => {
    const outfits = await Outfit.find().populate('creatorId', 'username').sort({ createdAt: -1 });
    res.render('outfits', { outfits });
});

app.listen(3000, () => console.log('🚀 http://localhost:3000'));