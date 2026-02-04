const express = require('express');
const axios = require('axios');
const app = express();

app.set('view engine', 'ejs');
app.use(express.static('public'));

app.get('/', async (req, res) => {
    // On récupère la catégorie dans l'URL (ex: /?cat=7616), sinon par défaut 4209
    const catId = req.query.cat || '4209'; 
    const RAPID_API_KEY = '97af797614mshae0c725bcec0efcp167d4fjsn198baaaf1ee2'; 
    
    const options = {
        method: 'GET',
        url: 'https://asos2.p.rapidapi.com/products/v2/list',
        params: {
            store: 'FR', offset: '0', categoryId: catId, 
            limit: '20', country: 'FR', currency: 'EUR', lang: 'fr-FR'
        },
        headers: {
            'x-rapidapi-key': RAPID_API_KEY,
            'x-rapidapi-host': 'asos2.p.rapidapi.com'
        }
    };

    try {
        const response = await axios.request(options);
        // On nettoie les données pour n'envoyer que l'essentiel à la vue
        const products = response.data.products.map(p => ({
            id: p.id,
            name: p.name,
            // On extrait juste le nombre pour le calcul du prix plus tard
            priceValue: p.price.current.value, 
            priceText: p.price.current.text,
            image: "https://" + p.imageUrl
        }));

        res.render('index', { products, currentCat: catId });
    } catch (error) {
        console.error("Erreur API :", error.message);
        res.render('index', { products: [], error: "Problème de connexion à l'API" });
    }
});
app.listen(3000, () => console.log('🚀 Studio Pro : http://localhost:3000'));