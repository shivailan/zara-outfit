const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const axios = require('axios');
const path = require('path');
const app = express();

// --- CONFIGURATION ---
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(session({
    secret: 'zara_secret_key_2026',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 3600000 } // Session d'une heure
}));

// --- MONGODB ---
mongoose.connect('mongodb://127.0.0.1:27017/zara_studio')
    .then(() => console.log('✅ MongoDB Connecté'))
    .catch(err => console.error('❌ Erreur MongoDB:', err));

// Modèle User avec email pour plus de sécurité
const User = mongoose.model('User', new mongoose.Schema({
    username: { type: String, required: true, unique: true, trim: true },
    password: { type: String, required: true }
}));

// --- ROUTES AUTHENTIFICATION ---

// Inscription
app.get('/register', (req, res) => res.render('register', { error: null }));

app.post('/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        // 1. Vérifier si l'utilisateur existe déjà
        const existingUser = await User.findOne({ username: username.toLowerCase() });
        if (existingUser) {
            return res.render('register', { error: "Ce nom d'utilisateur est déjà utilisé." });
        }

        // 2. Hachage du mot de passe
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // 3. Création
        await User.create({ 
            username: username.toLowerCase(), 
            password: hashedPassword 
        });
        
        res.redirect('/login');
    } catch (e) {
        res.render('register', { error: "Une erreur est survenue lors de l'inscription." });
    }
});

// Connexion
app.get('/login', (req, res) => res.render('login', { error: null }));

app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const user = await User.findOne({ username: username.toLowerCase() });

    if (user && await bcrypt.compare(password, user.password)) {
        req.session.userId = user._id;
        req.session.username = user.username;
        res.redirect('/');
    } else {
        res.render('login', { error: "Identifiants incorrects." });
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
    
    try {
        const response = await axios.get('https://asos2.p.rapidapi.com/products/v2/list', {
            params: { store: 'FR', offset: '0', categoryId: catId, limit: '20', country: 'FR', currency: 'EUR', lang: 'fr-FR' },
            headers: { 'x-rapidapi-key': RAPID_API_KEY, 'x-rapidapi-host': 'asos2.p.rapidapi.com' }
        });
        
        const products = response.data.products.map(p => ({
            name: p.name,
            priceValue: p.price.current.value,
            priceText: p.price.current.text,
            image: "https://" + p.imageUrl
        }));

        res.render('index', { 
            products, 
            currentCat: catId, 
            isLoggedIn: !!req.session.userId,
            user: req.session.username 
        });
    } catch (error) {
        res.render('index', { products: [], currentCat: catId, isLoggedIn: !!req.session.userId });
    }
});

app.listen(3000, () => console.log('🚀 Studio opérationnel sur http://localhost:3000'));