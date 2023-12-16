const express = require('express');
const bodyParser = require('body-parser');
const { MongoClient } = require('mongodb');
const envVariables = require('./config/env_variables');
const { authenticateUser } = require('./middlewares/authMiddleware');
const path = require('path');

const app = express();
const mongodbUri = envVariables.MONGODB_URI;
const client = new MongoClient(mongodbUri, { useNewUrlParser: true, useUnifiedTopology: true });

// Your Bing Maps API key
const BING_MAPS_API_KEY = 'AgkWMZlk5ts6xb8cJkzUar2iJMWTexduafRzsyANqeAF2b_PN0D2CZAKo8hfNqkB';

// Set 'views' directory for any views rendered
app.set('views', path.join(__dirname, 'public', 'views'));

// Set EJS as the view engine
app.set('view engine', 'ejs');

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));

// Variable to track the MongoDB connection status
let isConnected = false;

// MongoDB connection
let db;

async function connectMongoDB() {
    try {
        await client.connect();
        console.log('Connected to MongoDB successfully');
        const database = client.db('LMS'); // Replace 'YourDatabaseName' with your actual database name
        db = database;
    } catch (err) {
        console.error('Error connecting to MongoDB:', err);
        process.exit(1);
    }
}
async function insertUsersToDB(users) {
    try {
        const database = client.db('LMS');
        const usersCollection = database.collection('users');

        const result = await usersCollection.insertMany(users);
        console.log(`${result.insertedCount} users inserted`);
    } catch (err) {
        console.error('Error inserting users:', err);
    } finally {
        await client.close(); // Close the MongoDB connection after insertion
    }
}

// Usage:
const users = [
    { name: 'Ema', email: 'ema.karmila@globex.com.bn', signIn: '00:00:00 AM', signOut: '12:00:00 PM' },
    { name: 'Hasbul', email: 'another.user@globex.com.bn', signIn: '09:30:00 AM', signOut: '05:30:00 PM' },
    { name: 'Safwan', email: 'another.user@globex.com.bn', signIn: '09:30:00 AM', signOut: '05:30:00 PM' },
    { name: 'Khai', email: 'another.user@globex.com.bn', signIn: '09:30:00 AM', signOut: '05:30:00 PM' },
    // Add more user objects as needed
];

insertUsersToDB(users);

connectMongoDB();

// Routes
const attendanceRoutes = require('./routes/attendanceRoutes');
const userRoutes = require('./routes/userRoutes');
app.use('/attendance', authenticateUser, attendanceRoutes);
app.use('/user', userRoutes);

// Protected route using the authenticateUser middleware
app.get('/protectedRoute', authenticateUser, (req, res) => {
    res.send('This is a protected route');
});

// Route for the root path to render the attendance log
app.get('/', (req, res) => {
    const attendanceData = [
        {
            username: 'Ema',
            location: 'Office',
            signIn: '09:00 AM',
            signOut: '06:00 PM',
            date: '2023-12-01'
        },
        {
            username: 'Hasbul',
            location: 'Office',
            signIn: '09:00 AM',
            signOut: '06:00 PM',
            date: '2023-12-01'
        },
        {
            username: 'Safwan',
            location: 'Office',
            signIn: '09:00 AM',
            signOut: '06:00 PM',
            date: '2023-12-01'
        },
        {
            username: 'Khai',
            location: 'Office',
            signIn: '09:00 AM',
            signOut: '06:00 PM',
            date: '2023-12-01'
        }
    ];

    res.render('attendanceLog', { attendanceData: attendanceData }); // Render the attendance log view
});

app.get('/attendance-log', async (req, res) => {
    try {
        console.log('Attempting to retrieve attendance data...');
        const attendanceCollection = db.collection('attendance');
        const attendanceData = await attendanceCollection.find({}).toArray();

        console.log('Attendance Data:', attendanceData); // Log attendanceData to check if it's fetched correctly

        res.render('attendanceLog', { attendanceData: attendanceData });
    } catch (err) {
        console.error('Error fetching attendance log:', err);
        res.status(500).send('Error fetching attendance log');
    }
});

// Record attendance
app.post('/add-attendance', async (req, res) => {
    const { username, location, signIn, signOut, date } = req.body;

    try {
        const attendanceCollection = db.collection('attendance');

        await attendanceCollection.insertOne({
            username,
            location,
            signIn,
            signOut,
            date
        });

        res.redirect('/map'); // Redirect to the map page or another appropriate location
    } catch (err) {
        console.error('Error adding attendance:', err);
        res.status(500).send('Error adding attendance');
    }
});

// Attendance recording route
app.post('/attendance', async (req, res) => {
    const { latitude, longitude } = req.body;

    const currentDate = new Date().toISOString().split('T')[0];
    const currentTime = new Date().toLocaleTimeString();

    if (latitude && longitude) {
        try {
            const attendanceCollection = db.collection('attendance');

            await attendanceCollection.insertOne({
                location: { type: 'Point', coordinates: [parseFloat(longitude), parseFloat(latitude)] },
                timestamp: { date: currentDate, time: currentTime }
            });

            res.status(200).json({ message: 'Attendance recorded successfully' });
        } catch (err) {
            console.error('Error recording attendance:', err);
            res.status(500).json({ error: 'Error recording attendance' });
        }
    } else {
        res.status(400).json({ error: 'Latitude and longitude are required' });
    }
});

// Route to render the sign-in form
app.get('/signin', async (req, res) => {
    if (!isConnected) {
        try {
            await connectMongoDB(); // Connect if not already connected
            renderSignInForm(req, res);
        } catch (err) {
            console.error('Error connecting to MongoDB:', err);
            res.status(500).send('Error connecting to MongoDB');
        }
    } else {
        renderSignInForm(req, res);
    }
});

// Function to render the sign-in form
function renderSignInForm(req, res) {
    const bingMapsAPIKey = 'AgkWMZlk5ts6xb8cJkzUar2iJMWTexduafRzsyANqeAF2b_PN0D2CZAKo8hfNqkB';
    res.render('signin', { bingMapsAPIKey });
}

const { ObjectId } = require('mongodb'); // Import ObjectId from MongoDB
const { time } = require('console');

// Route to handle sign-in form submission
app.post('/signin', async (req, res) => {
    await connectMongoDB(); // Ensure MongoDB connection before processing sign-in

    const { username, location, latitude, longitude } = req.body;
    const currentDate = new Date().toISOString().split('T')[0];
    const currentTime = new Date().toLocaleTimeString();

    try {
        const attendanceCollection = db.collection('attendance'); // Get attendanceCollection from the database

        const existingUser = await attendanceCollection.findOne({ username });

        if (existingUser) {
            await attendanceCollection.updateOne(
                { _id: new ObjectId(existingUser._id) },
                {
                    $set: {
                        signIn: currentTime,
                        location,
                        latitude,
                        longitude,
                        date: currentDate
                    }
                }
            );
            console.log('Updated sign-in for existing user:', username);
        } else {
            await attendanceCollection.insertOne({
                username,
                signIn: currentTime,
                signOut: null,
                location,
                latitude,
                longitude,
                date: currentDate
            });
            console.log('Added new sign-in entry:', username);
        }

        res.redirect('/signin-success');
    } catch (err) {
        console.error('Error processing sign-in:', err);
        res.status(500).send('Error processing sign-in');
    }
});

// Route to render the sign-out form
app.get('/signout', async (req, res) => {
    if (!isConnected) {
        try {
            await connectMongoDB(); // Connect if not already connected
            renderSignOutForm(req, res);
        } catch (err) {
            console.error('Error connecting to MongoDB:', err);
            res.status(500).send('Error connecting to MongoDB');
        }
    } else {
        renderSignOutForm(req, res);
    }
});

// Function to render the sign-out form
function renderSignOutForm(req, res) {
    const bingMapsAPIKey = 'AgkWMZlk5ts6xb8cJkzUar2iJMWTexduafRzsyANqeAF2b_PN0D2CZAKo8hfNqkB';
    res.render('signout', { bingMapsAPIKey });
}

// Route to handle sign-out
app.post('/signout', async (req, res) => {
    await connectMongoDB(); // Ensure MongoDB connection before processing sign-out

    const { username } = req.body;
    const currentTime = new Date().toLocaleTimeString();

    try {
        const attendanceCollection = db.collection('attendance'); // Get attendanceCollection from the database

        await attendanceCollection.updateOne(
            { username },
            { $set: { signOut: currentTime } }
        );
        console.log('Updated sign-out for user:', username);
        res.redirect('/signout-success');
    } catch (err) {
        console.error('Error processing sign-out:', err);
        res.status(500).send('Error processing sign-out');
    }
});

// Route to handle successful sign-in
app.get('/signin-success', (req, res) => {
    res.send('Sign-In successful!'); // You can customize this response or render a success page here
});

// Route to handle successful sign-out
app.get('/signout-success', (req, res) => {
    res.send('Sign-Out successful!'); // You can customize this response or render a success page here
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
    console.log(`Server is running on port ${PORT}`);
    await connectMongoDB();
});
