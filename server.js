const cors = require('cors');
const express = require('express');
const app = express();
const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');
const { Sequelize, DataTypes } = require('sequelize');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer'); // For email notifications

const port = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json());
app.use(cors());
app.use(express.static('public'));

// Database connection
const sequelize = new Sequelize('salon', 'root', 'root', {
  host: 'localhost',
  dialect: 'mysql',
  logging: console.log,
});

// Test the database connection
sequelize.authenticate()
  .then(() => console.log('Database connected!'))
  .catch(err => console.error('Database connection error:', err));

// Define models
const Feedback = sequelize.define('Feedback', {
  name: { type: DataTypes.STRING, allowNull: false },
  email: { type: DataTypes.STRING, allowNull: false },
  feedback: { type: DataTypes.TEXT, allowNull: false },
  rating: { type: DataTypes.INTEGER, allowNull: false },
}, { timestamps: true });

const Service = sequelize.define('Service', {
  name: { type: DataTypes.STRING, allowNull: false },
  price: { type: DataTypes.FLOAT, allowNull: false },
}, { timestamps: false });

const Appointment = sequelize.define('Appointment', {
  customer_name: { type: DataTypes.STRING, allowNull: false },
  email: { type: DataTypes.STRING, allowNull: false },
  phone: { type: DataTypes.STRING, allowNull: false },
  service_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: Service, key: 'id' } },
  date: { type: DataTypes.DATEONLY, allowNull: false },
  time: { type: DataTypes.STRING, allowNull: false },
  status: {
    type: DataTypes.ENUM('pending', 'confirmed', 'completed', 'canceled'),
    defaultValue: 'pending',
  },
}, { timestamps: true });

const service = await Service.findOne({
  where: sequelize.where(sequelize.fn('LOWER', sequelize.col('name')), sequelize.fn('LOWER', service_name)),
});

if (!service) {
  return res.status(400).json({ message: 'Service not found!' });
}

console.log("Service Price: ", service.price);  // Debugging line to check price

// Relationships
Appointment.belongsTo(Service, { foreignKey: 'service_id' });

// Sync models with the database
sequelize.sync({ alter: true })
  .then(() => console.log('Models synced with the database!'))
  .catch(err => console.error('Model sync failed:', err));

// Serve homepage
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Route for creating appointments
app.post('/appointments', async (req, res) => {
  const { customer_name, email, phone, service_name, date, time } = req.body;

  if (!customer_name || !email || !phone || !service_name || !date || !time) {
    return res.status(400).json({ message: 'All fields are required!' });
  }

  try {
    // Find the service by name to get its id
    const service = await Service.findOne({
      where: sequelize.where(sequelize.fn('LOWER', sequelize.col('name')), sequelize.fn('LOWER', service_name)),
    });

    if (!service) {
      return res.status(400).json({ message: 'Service not found!' });
    }

    // Create the appointment in the database
    const newAppointment = await Appointment.create({
      customer_name,
      email,
      phone,
      service_id: service.id, // Use the service's ID from the Service table
      date,
      time,
      status: 'pending', // Default status
    });

    res.status(200).json({ message: 'Appointment booked successfully!', appointment: newAppointment , servicePrice: service.price });
  } catch (error) {
    console.error('Error booking appointment:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

// Route for fetching appointments
app.get('/appointments', async (req, res) => {
  try {
    const appointments = await Appointment.findAll({ include: [Service] });
    res.json(appointments);
  } catch (error) {
    console.error('Error fetching appointments:', error);
    res.status(500).json({ message: 'Failed to fetch appointments' });
  }
});
app.get('/services', async (req, res) => {
  try {
    const appointments = await Appointment.findAll({ include: [Service] });
    res.json(service);
  } catch (error) {
    console.error('Error fetching services:', error);
    res.status(500).json({ message: 'Failed to fetch services' });
  }
});

// Route for downloading feedback as Excel file
app.get('/download-feedback', async (req, res) => {
  try {
    const feedbackData = await Feedback.findAll();
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Feedback');

    worksheet.columns = [
      { header: 'Name', key: 'name', width: 30 },
      { header: 'Email', key: 'email', width: 30 },
      { header: 'Rating', key: 'rating', width: 10 },
      { header: 'Comments', key: 'comments', width: 50 },
      { header: 'Date', key: 'date', width: 20 },
    ];

    feedbackData.forEach(item => {
      worksheet.addRow({
        name: item.name,
        email: item.email,
        rating: item.rating,
        comments: item.feedback,
        date: item.createdAt.toLocaleString(),
      });
    });

    const filePath = path.join(__dirname, 'public', 'feedback.xlsx');
    await workbook.xlsx.writeFile(filePath);

    res.download(filePath, 'feedback.xlsx', (err) => {
      if (err) {
        console.error('Error downloading the file:', err);
        res.status(500).send('Could not download the file.');
      }
      fs.unlinkSync(filePath); // Delete the file after download
    });
  } catch (error) {
    console.error('Error exporting feedback data:', error);
    res.status(500).json({ success: false, message: 'Failed to generate the Excel file.' });
  }
});

// Route for submitting feedback
app.post('/feedback', async (req, res) => {
  const { name, email, rating, comments } = req.body;

  if (!name || !email || !rating || !comments) {
    return res.status(400).json({ success: false, message: 'All fields are required!' });
  }

  try {
    const newFeedback = await Feedback.create({
      name,
      email,
      feedback: comments,
      rating,
    });

    res.status(201).json({
      success: true,
      message: 'Feedback saved successfully!',
      data: newFeedback,
    });
  } catch (error) {
    console.error('Error saving feedback:', error);
    res.status(500).json({ success: false, message: 'Failed to save feedback.' });
  }
});

// Route for adding services
app.post('/services', async (req, res) => {
  const { name, price } = req.body;

  if (!name || !price) {
    return res.status(400).json({ message: 'Service name and price are required' });
  }

  try {
    const service = await Service.create({ name, price });
    res.status(201).json({ message: 'Service added', service });
  } catch (error) {
    console.error('Error adding service:', error);
    res.status(500).json({ error: 'Failed to add service' });
  }
});

// Route for updating services
app.put('/services/:id', async (req, res) => {
  const { id } = req.params;
  const { name, price } = req.body;

  try {
    const service = await Service.findByPk(id);
    if (!service) {
      return res.status(404).json({ message: 'Service not found' });
    }
    await service.update({ name, price });
    res.status(200).json({ message: 'Service updated successfully', service });
  } catch (error) {
    console.error('Error updating service:', error);
    res.status(500).json({ error: 'Failed to update service' });
  }
});

// Route for deleting services
app.delete('/services/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const service = await Service.findByPk(id);
    if (!service) {
      return res.status(404).json({ message: 'Service not found' });
    }
    await service.destroy();
    res.status(200).json({ message: 'Service deleted successfully' });
  } catch (error) {
    console.error('Error deleting service:', error);
    res.status(500).json({ error: 'Failed to delete service' });
  }
});

// Route for confirming an appointment
app.post('/appointments/:id/confirm', async (req, res) => {
  const appointmentId = req.params.id;

  try {
    const appointment = await Appointment.findByPk(appointmentId, { include: [Service] });

    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' });
    }

    appointment.status = 'confirmed';
    await appointment.save();

    const emailSubject = 'Your Appointment is Confirmed';
    const emailText = `Dear ${appointment.customer_name},\n\nYour appointment for the service "${appointment.service.name}" on ${appointment.date} at ${appointment.time} has been confirmed.\n\nThank you!`;

    try {
      await sendEmail(appointment.email, emailSubject, emailText);
    } catch (emailError) {
      console.error('Error sending confirmation email:', emailError);
      return res.status(500).json({
        message: 'Appointment confirmed but email sending failed. Please try again later.',
        appointment,
      });
    }

    res.json({ message: 'Appointment confirmed and email sent successfully', appointment });
  } catch (error) {
    console.error('Error confirming appointment:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Email sending function
async function sendEmail(to, subject, text) {
  const transporter = nodemailer.createTransport({
    service: 'gmail', // Use your email provider
    auth: {
      user: 'shikshadwivedi05@gmail.com', // Your email address
      pass: 'fcca xylq vrqe mhgm', // Your Gmail App Password
    },
  });

  const mailOptions = {
    from: 'shikshadwivedi05@gmail.com',
    to,
    subject,
    text,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent successfully:', info.response);
  } catch (error) {
    console.error('Error sending email:', error);
  }
}

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
