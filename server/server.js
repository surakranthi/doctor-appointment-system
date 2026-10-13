
const express = require("express");
const cors = require("cors");
const pool = require("./db/connection");

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());

// Validate YYYY-MM-DD without converting the date to UTC.
function isValidDateString(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return false;
    }

    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(year, month - 1, day);

    return (
        date.getFullYear() === year &&
        date.getMonth() === month - 1 &&
        date.getDate() === day
    );
}

function getTodayString() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

app.get("/", (req, res) => {
    res.send("Doctor Appointment API is running");
});

app.get("/api/test", (req, res) => {
    res.json({ message: "Backend connected successfully" });
});

// Test PostgreSQL connection
app.get("/api/db-test", async (req, res) => {
    try {
        const result = await pool.query(
            "SELECT current_database() AS database"
        );

        res.json({
            message: "PostgreSQL connected successfully",
            database: result.rows[0].database
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: "PostgreSQL connection failed"
        });
    }
});

// Get one doctor
app.get("/api/doctors/:id", async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT
                d.doctor_id,
                d.name AS doctor_name,
                s.name AS specialization,
                d.experience_years,
                d.consultation_fee
             FROM doctors d
             JOIN specializations s
                ON d.specialization_id = s.specialization_id
             WHERE d.doctor_id = $1`,
            [req.params.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "Doctor not found"
            });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: "Failed to fetch doctor"
        });
    }
});

// Get all doctors
app.get("/api/doctors", async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT
                d.doctor_id,
                d.name AS doctor_name,
                s.name AS specialization,
                d.experience_years,
                d.consultation_fee
             FROM doctors d
             JOIN specializations s
                ON d.specialization_id = s.specialization_id
             ORDER BY d.name`
        );

        res.json(result.rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: "Failed to fetch doctors"
        });
    }
});

// Get specializations
app.get("/api/specializations", async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT specialization_id, name
             FROM specializations
             ORDER BY name`
        );

        res.json(result.rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: "Failed to fetch specializations"
        });
    }
});

// Get available appointment times
app.get("/api/appointments/available", async (req, res) => {
    try {
        const { doctor_id, date } = req.query;

        if (!doctor_id || !date || !isValidDateString(date)) {
            return res.status(400).json({
                message: "Please provide a valid doctor ID and appointment date."
            });
        }

        if (date < getTodayString()) {
            return res.status(400).json({
                message: "Appointment date cannot be in the past."
            });
        }

        const slots = [
            "09:00", "09:30",
            "10:00", "10:30",
            "11:00", "11:30",
            "12:00",
            "14:00", "14:30",
            "15:00", "15:30",
            "16:00", "16:30",
            "17:00"
        ];

        const result = await pool.query(
            `SELECT appointment_time
             FROM appointments
             WHERE doctor_id = $1
               AND appointment_date = $2
               AND status = 'Booked'`,
            [doctor_id, date]
        );

        const bookedSlots = result.rows.map((row) =>
            String(row.appointment_time).slice(0, 5)
        );

        const availableSlots = slots.filter(
            (slot) => !bookedSlots.includes(slot)
        );

        res.json({
            doctor_id,
            date,
            available_slots: availableSlots
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: "Failed to fetch available slots"
        });
    }
});

// Book an appointment
app.post("/api/appointments", async (req, res) => {
    const {
        patient_name,
        email,
        phone,
        date_of_birth,
        doctor_id,
        appointment_date,
        appointment_time,
        reason
    } = req.body;

    // Validate required fields before opening a database transaction.
    if (
        typeof patient_name !== "string" ||
        typeof email !== "string" ||
        typeof phone !== "string" ||
        !patient_name.trim() ||
        !email.trim() ||
        !phone.trim() ||
        !doctor_id ||
        !appointment_date ||
        !appointment_time
    ) {
        return res.status(400).json({
            message: "Please complete all required fields."
        });
    }

    const cleanName = patient_name.trim();
    const looksLikeDate = /^\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}$/.test(cleanName);

    if (cleanName.length < 2 || looksLikeDate || /^\d+$/.test(cleanName)) {
        return res.status(400).json({
            message: "Enter your full name, not a date or number."
        });
    }

    if (!isValidDateString(appointment_date)) {
        return res.status(400).json({
            message: "Please enter a valid calendar date."
        });
    }

    if (appointment_date < getTodayString()) {
        return res.status(400).json({
            message: "Please select today or a future appointment date."
        });
    }

    const validSlots = [
        "09:00", "09:30",
        "10:00", "10:30",
        "11:00", "11:30",
        "12:00",
        "14:00", "14:30",
        "15:00", "15:30",
        "16:00", "16:30",
        "17:00"
    ];

    if (!validSlots.includes(String(appointment_time).slice(0, 5))) {
        return res.status(400).json({
            message: "Please select a valid appointment time."
        });
    }

    if (date_of_birth) {
        if (
            !isValidDateString(date_of_birth) ||
            date_of_birth > getTodayString()
        ) {
            return res.status(400).json({
                message: "Please enter a valid date of birth."
            });
        }
    }

    let client;
    let transactionStarted = false;

    try {
        client = await pool.connect();

        await client.query("BEGIN");
        transactionStarted = true;

        // Check that the doctor exists.
        const doctorResult = await client.query(
            "SELECT doctor_id FROM doctors WHERE doctor_id = $1",
            [doctor_id]
        );

        if (doctorResult.rows.length === 0) {
            await client.query("ROLLBACK");
            transactionStarted = false;

            return res.status(400).json({
                message: "Selected doctor was not found."
            });
        }

        // Check whether this time slot is already booked.
        const existingAppointment = await client.query(
            `SELECT appointment_id
             FROM appointments
             WHERE doctor_id = $1
               AND appointment_date = $2
               AND appointment_time = $3
               AND status = 'Booked'`,
            [doctor_id, appointment_date, appointment_time]
        );

        if (existingAppointment.rows.length > 0) {
            await client.query("ROLLBACK");
            transactionStarted = false;

            return res.status(409).json({
                message: "This appointment slot is already booked. Please choose another time."
            });
        }

        // Find the patient by email, or create a new patient.
        const patientResult = await client.query(
            `SELECT patient_id
             FROM patients
             WHERE LOWER(email) = LOWER($1)`,
            [email.trim()]
        );

        let patientId;

        if (patientResult.rows.length > 0) {
            patientId = patientResult.rows[0].patient_id;
        } else {
            const newPatient = await client.query(
                `INSERT INTO patients
                    (name, email, phone, date_of_birth)
                 VALUES ($1, $2, $3, $4)
                 RETURNING patient_id`,
                [
                    cleanName,
                    email.trim(),
                    phone.trim(),
                    date_of_birth || null
                ]
            );

            patientId = newPatient.rows[0].patient_id;
        }

        // Create the appointment.
        const appointmentResult = await client.query(
            `INSERT INTO appointments
                (patient_id, doctor_id, appointment_date,
                 appointment_time, status, reason)
             VALUES ($1, $2, $3, $4, 'Booked', $5)
             RETURNING appointment_id`,
            [
                patientId,
                doctor_id,
                appointment_date,
                appointment_time,
                reason || null
            ]
        );

        await client.query("COMMIT");
        transactionStarted = false;

        res.status(201).json({
            message: "Appointment booked successfully",
            appointment_id: appointmentResult.rows[0].appointment_id
        });
    } catch (error) {
        if (client && transactionStarted) {
            try {
                await client.query("ROLLBACK");
            } catch (rollbackError) {
                console.error("Rollback failed:", rollbackError);
            }
        }

        console.error(error);

        if (error.code === "23505") {
            return res.status(409).json({
                message: "This appointment slot is already booked. Please choose another time."
            });
        }

        res.status(500).json({
            message: "Failed to book appointment"
        });
    } finally {
        if (client) {
            client.release();
        }
    }
});

// Patient appointment history
app.get("/api/patients/:email/appointments", async (req, res) => {
    try {
        const email = req.params.email;

        const result = await pool.query(
            `SELECT
                a.appointment_id,
                p.name AS patient_name,
                d.name AS doctor_name,
                s.name AS specialization,
                a.appointment_date,
                a.appointment_time,
                a.status,
                a.reason
             FROM appointments a
             JOIN patients p
                ON a.patient_id = p.patient_id
             JOIN doctors d
                ON a.doctor_id = d.doctor_id
             JOIN specializations s
                ON d.specialization_id = s.specialization_id
             WHERE LOWER(p.email) = LOWER($1)
             ORDER BY a.appointment_date DESC, a.appointment_time DESC`,
            [email]
        );

        res.json(result.rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: "Failed to fetch appointment history"
        });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
