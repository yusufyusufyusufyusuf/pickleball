const express = require('express');
const router = express.Router();
const db = require('../db');

// ─── Court endpoints ───

// Get all active courts
router.get('/courts', (req, res) => {
  const courts = db.prepare('SELECT * FROM courts WHERE is_active = 1').all();
  res.json(courts);
});

// ─── Booking endpoints (customer-facing) ───

// Get available time slots for a given court and date
router.get('/availability', (req, res) => {
  const { court_id, date } = req.query;
  if (!court_id || !date) {
    return res.status(400).json({ error: 'court_id and date are required' });
  }

  // Generate all possible 1-hour slots from 7 AM to 9 PM
  const allSlots = [];
  for (let hour = 7; hour < 21; hour++) {
    const start = `${String(hour).padStart(2, '0')}:00`;
    const end = `${String(hour + 1).padStart(2, '0')}:00`;
    allSlots.push({ start_time: start, end_time: end });
  }

  // Get existing bookings for this court and date
  const booked = db.prepare(
    `SELECT start_time, end_time FROM bookings
     WHERE court_id = ? AND date = ? AND status != 'cancelled'`
  ).all(court_id, date);

  const bookedTimes = new Set(booked.map(b => b.start_time));

  const slots = allSlots.map(slot => ({
    ...slot,
    available: !bookedTimes.has(slot.start_time)
  }));

  res.json(slots);
});

// Create a new booking
router.post('/bookings', (req, res) => {
  const { court_id, customer_name, customer_email, customer_phone, date, start_time, end_time, notes } = req.body;

  if (!court_id || !customer_name || !customer_email || !date || !start_time || !end_time) {
    return res.status(400).json({ error: 'Missing required fields: court_id, customer_name, customer_email, date, start_time, end_time' });
  }

  // Validate date is not in the past
  const today = new Date().toISOString().split('T')[0];
  if (date < today) {
    return res.status(400).json({ error: 'Cannot book a date in the past' });
  }

  // Check for conflicting bookings
  const conflict = db.prepare(
    `SELECT id FROM bookings
     WHERE court_id = ? AND date = ? AND start_time = ? AND status != 'cancelled'`
  ).get(court_id, date, start_time);

  if (conflict) {
    return res.status(409).json({ error: 'This time slot is already booked' });
  }

  const result = db.prepare(
    `INSERT INTO bookings (court_id, customer_name, customer_email, customer_phone, date, start_time, end_time, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(court_id, customer_name, customer_email, customer_phone || null, date, start_time, end_time, notes || null);

  const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(booking);
});

// ─── Admin endpoints ───

// Get all bookings with optional filters
router.get('/admin/bookings', (req, res) => {
  const { date, court_id, status } = req.query;

  let sql = `SELECT b.*, c.name as court_name
             FROM bookings b
             JOIN courts c ON b.court_id = c.id
             WHERE 1=1`;
  const params = [];

  if (date) {
    sql += ' AND b.date = ?';
    params.push(date);
  }
  if (court_id) {
    sql += ' AND b.court_id = ?';
    params.push(court_id);
  }
  if (status) {
    sql += ' AND b.status = ?';
    params.push(status);
  }

  sql += ' ORDER BY b.date DESC, b.start_time ASC';

  const bookings = db.prepare(sql).all(...params);
  res.json(bookings);
});

// Get booking stats
router.get('/admin/stats', (req, res) => {
  const today = new Date().toISOString().split('T')[0];

  const totalBookings = db.prepare('SELECT COUNT(*) as count FROM bookings').get().count;
  const todayBookings = db.prepare('SELECT COUNT(*) as count FROM bookings WHERE date = ?').get(today).count;
  const upcomingBookings = db.prepare(
    "SELECT COUNT(*) as count FROM bookings WHERE date >= ? AND status = 'confirmed'"
  ).get(today).count;
  const cancelledBookings = db.prepare(
    "SELECT COUNT(*) as count FROM bookings WHERE status = 'cancelled'"
  ).get().count;

  res.json({ totalBookings, todayBookings, upcomingBookings, cancelledBookings });
});

// Cancel a booking
router.patch('/admin/bookings/:id/cancel', (req, res) => {
  const { id } = req.params;
  const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(id);

  if (!booking) {
    return res.status(404).json({ error: 'Booking not found' });
  }

  db.prepare("UPDATE bookings SET status = 'cancelled' WHERE id = ?").run(id);
  const updated = db.prepare('SELECT * FROM bookings WHERE id = ?').get(id);
  res.json(updated);
});

// Delete a booking
router.delete('/admin/bookings/:id', (req, res) => {
  const { id } = req.params;
  const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(id);

  if (!booking) {
    return res.status(404).json({ error: 'Booking not found' });
  }

  db.prepare('DELETE FROM bookings WHERE id = ?').run(id);
  res.json({ message: 'Booking deleted' });
});

// ─── Admin court management ───

router.get('/admin/courts', (req, res) => {
  const courts = db.prepare('SELECT * FROM courts').all();
  res.json(courts);
});

router.post('/admin/courts', (req, res) => {
  const { name, description } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Court name is required' });
  }
  const result = db.prepare('INSERT INTO courts (name, description) VALUES (?, ?)').run(name, description || null);
  const court = db.prepare('SELECT * FROM courts WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(court);
});

router.patch('/admin/courts/:id', (req, res) => {
  const { id } = req.params;
  const { name, description, is_active } = req.body;

  const court = db.prepare('SELECT * FROM courts WHERE id = ?').get(id);
  if (!court) {
    return res.status(404).json({ error: 'Court not found' });
  }

  db.prepare('UPDATE courts SET name = ?, description = ?, is_active = ? WHERE id = ?')
    .run(name ?? court.name, description ?? court.description, is_active ?? court.is_active, id);

  const updated = db.prepare('SELECT * FROM courts WHERE id = ?').get(id);
  res.json(updated);
});

module.exports = router;
