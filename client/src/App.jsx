import { useEffect, useState } from "react";



const API = "http://localhost:5000/api";



function getLocalDateString(date = new Date()) {

  const year = date.getFullYear();

  const month = String(date.getMonth() + 1).padStart(2, "0");

  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;

}



function isValidDateString(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);

  // Compare local calendar components. toISOString() converts to UTC
  // and can incorrectly reject a valid date in some time zones.
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}



function App() {

  const [specializations, setSpecializations] = useState([]);

  const [doctors, setDoctors] = useState([]);

  const [selectedSpecialization, setSelectedSpecialization] = useState("");

  const [selectedDoctor, setSelectedDoctor] = useState("");

  const [appointmentDate, setAppointmentDate] = useState("");

  const [availableSlots, setAvailableSlots] = useState([]);

  const [selectedTime, setSelectedTime] = useState("");

  const [patient, setPatient] = useState({

    patient_name: "",

    email: "",

    phone: "",

    date_of_birth: "",

    reason: "",

  });

  const [loading, setLoading] = useState(true);

  const [slotsLoading, setSlotsLoading] = useState(false);

  const [booking, setBooking] = useState(false);

  const [error, setError] = useState("");

  const [confirmation, setConfirmation] = useState(null);

  const [historyEmail, setHistoryEmail] = useState("");

  const [history, setHistory] = useState([]);

  const [historyLoading, setHistoryLoading] = useState(false);

  const [historyError, setHistoryError] = useState("");

  const [historySearched, setHistorySearched] = useState(false);



  const minimumDate = getLocalDateString();



  useEffect(() => {

    fetch(`${API}/specializations`)

      .then((res) => {

        if (!res.ok) throw new Error("Failed to load specializations.");

        return res.json();

      })

      .then(setSpecializations)

      .catch((err) => setError(err.message))

      .finally(() => setLoading(false));

  }, []);



  useEffect(() => {

    if (!selectedSpecialization) {

      setDoctors([]);

      return;

    }



    fetch(`${API}/doctors`)

      .then((res) => {

        if (!res.ok) throw new Error("Failed to load doctors.");

        return res.json();

      })

      .then((data) => {

        setDoctors(data.filter((doctor) => doctor.specialization === selectedSpecialization));

      })

      .catch((err) => setError(err.message));

  }, [selectedSpecialization]);



  useEffect(() => {

    if (!selectedDoctor || !appointmentDate || !isValidDateString(appointmentDate) || appointmentDate < getLocalDateString()) {

      setAvailableSlots([]);

      return;

    }



    let cancelled = false;

    setSlotsLoading(true);

    setAvailableSlots([]);

    setSelectedTime("");



    fetch(`${API}/appointments/available?doctor_id=${encodeURIComponent(selectedDoctor)}&date=${encodeURIComponent(appointmentDate)}`)

      .then((res) => {

        if (!res.ok) throw new Error("Failed to load available slots.");

        return res.json();

      })

      .then((data) => {

        if (!cancelled) setAvailableSlots(Array.isArray(data.available_slots) ? data.available_slots : []);

      })

      .catch((err) => {

        if (!cancelled) setError(err.message);

      })

      .finally(() => {

        if (!cancelled) setSlotsLoading(false);

      });



    return () => { cancelled = true; };

  }, [selectedDoctor, appointmentDate]);



  const selectedDoctorDetails = doctors.find((doctor) => String(doctor.doctor_id) === selectedDoctor);



  function handlePatientChange(event) {

    const { name, value } = event.target;

    setPatient((previous) => ({ ...previous, [name]: value }));

  }



  function handleAppointmentDateChange(event) {
    const value = event.target.value;
    setError("");
    setSelectedTime("");
    setAvailableSlots([]);

    if (!value) {
      setAppointmentDate("");
      return;
    }

    if (!isValidDateString(value)) {
      setAppointmentDate("");
      setError("Please choose a valid calendar date.");
      return;
    }

    if (value < getLocalDateString()) {
      setAppointmentDate("");
      setError("Appointment date cannot be in the past. Please choose today or a future date.");
      return;
    }

    setAppointmentDate(value);
  }



  async function bookAppointment(event) {

    event.preventDefault();

    setError("");



    const cleanName = patient.patient_name.trim();

    const looksLikeDate = /^\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}$/.test(cleanName);

    if (cleanName.length < 2 || looksLikeDate || /^\d+$/.test(cleanName)) {

      setError("Enter your real full name, not a date or number.");

      return;

    }

    if (!appointmentDate || !isValidDateString(appointmentDate) || appointmentDate < getLocalDateString()) {

      setError("Please select a valid appointment date that is today or in the future.");

      setAppointmentDate("");

      setSelectedTime("");

      return;

    }

    if (!selectedDoctor || !selectedTime) {

      setError("Please select a doctor and an available time slot.");

      return;

    }



    setBooking(true);

    try {

      const response = await fetch(`${API}/appointments`, {

        method: "POST",

        headers: { "Content-Type": "application/json" },

        body: JSON.stringify({

          ...patient,

          patient_name: cleanName,

          doctor_id: selectedDoctor,

          appointment_date: appointmentDate,

          appointment_time: selectedTime,

        }),

      });

      const data = await response.json();

      if (!response.ok) throw new Error(data.message || "Appointment booking failed.");



      setConfirmation({

        ...data,

        patientName: cleanName,

        doctorName: selectedDoctorDetails?.doctor_name || "",

        date: appointmentDate,

        time: String(selectedTime).slice(0, 5),

      });

      setHistoryEmail(patient.email.trim());

    } catch (err) {

      setError(err.message);

    } finally {

      setBooking(false);

    }

  }



  async function viewAppointmentHistory(event) {

    event.preventDefault();

    setHistoryLoading(true);

    setHistoryError("");

    setHistorySearched(false);

    setHistory([]);

    try {

      const response = await fetch(`${API}/patients/${encodeURIComponent(historyEmail.trim())}/appointments`);

      if (!response.ok) throw new Error("Unable to load appointment history.");

      const data = await response.json();

      setHistory(Array.isArray(data) ? data : []);

      setHistorySearched(true);

    } catch (err) {

      setHistoryError(err.message);

    } finally {

      setHistoryLoading(false);

    }

  }



  function resetBooking() {

    setConfirmation(null);

    setSelectedSpecialization("");

    setSelectedDoctor("");

    setAppointmentDate("");

    setSelectedTime("");

    setAvailableSlots([]);

    setPatient({ patient_name: "", email: "", phone: "", date_of_birth: "", reason: "" });

    setError("");

  }



  return (

    <main style={styles.main}>

      <header style={styles.header}>

        <h1 style={styles.title}>Doctor Appointment System</h1>

        <p style={styles.subtitle}>Find a doctor and book your appointment online.</p>

      </header>



      {error && <p role="alert" style={styles.error}>{error}</p>}



      {confirmation ? (

        <section style={styles.successCard}>

          <h2 style={styles.heading}>Appointment Booked Successfully!</h2>

          <p><strong>Appointment ID:</strong> {confirmation.appointment_id}</p>

          <p><strong>Patient:</strong> {confirmation.patientName}</p>

          <p><strong>Doctor:</strong> {confirmation.doctorName}</p>

          <p><strong>Date:</strong> {confirmation.date}</p>

          <p><strong>Time:</strong> {confirmation.time}</p>

          <button type="button" style={styles.button} onClick={resetBooking}>Book Another Appointment</button>

        </section>

      ) : (

        <>

          <section style={styles.section}>

            <h2 style={styles.heading}>1. Select Specialization</h2>

            {loading ? <p>Loading specializations...</p> : (

              <select style={styles.input} value={selectedSpecialization} onChange={(event) => {

                setSelectedSpecialization(event.target.value);

                setSelectedDoctor(""); setAppointmentDate(""); setSelectedTime(""); setError("");

              }}>

                <option value="">Choose specialization</option>

                {specializations.map((item) => <option key={item.specialization_id} value={item.name}>{item.name}</option>)}

              </select>

            )}

          </section>



          {selectedSpecialization && <section style={styles.section}>

            <h2 style={styles.heading}>2. Select Doctor</h2>

            {doctors.length === 0 ? <p>No doctors found for this specialization.</p> : doctors.map((doctor) => (

              <article key={doctor.doctor_id} style={styles.card}>

                <h3 style={styles.heading}>{doctor.doctor_name}</h3>

                <p>Specialization: {doctor.specialization}</p>

                <p>Experience: {doctor.experience_years} years</p>

                <p>Consultation fee: ₹{doctor.consultation_fee}</p>

                <button type="button" style={selectedDoctor === String(doctor.doctor_id) ? styles.selectedButton : styles.button} onClick={() => {

                  setSelectedDoctor(String(doctor.doctor_id)); setAppointmentDate(""); setSelectedTime(""); setAvailableSlots([]); setError("");

                }}>{selectedDoctor === String(doctor.doctor_id) ? "Doctor Selected" : "Select Doctor"}</button>

              </article>

            ))}

          </section>}



          {selectedDoctor && <section style={styles.section}>

            <h2 style={styles.heading}>3. Select Date and Time</h2>

            <label style={styles.label} htmlFor="appointment-date">Appointment date</label>

            <input id="appointment-date" style={styles.input} type="date" min={minimumDate} value={appointmentDate} onChange={handleAppointmentDateChange} required />

            {appointmentDate && <>

              <h3 style={styles.heading}>Available Slots</h3>

              {slotsLoading ? <p>Loading available slots...</p> : availableSlots.length === 0 ? <p>No available slots. Try another date.</p> : (

                <div style={styles.slots}>

                  {availableSlots.map((slot) => <button key={slot} type="button" style={selectedTime === slot ? styles.selectedSlot : styles.slotButton} onClick={() => setSelectedTime(slot)}>{String(slot).slice(0, 5)}</button>)}

                </div>

              )}

              {selectedTime && <p><strong>Selected time:</strong> {String(selectedTime).slice(0, 5)}</p>}

            </>}

          </section>}



          {selectedDoctor && appointmentDate && selectedTime && <section style={styles.section}>

            <h2 style={styles.heading}>4. Patient Details</h2>

            <form onSubmit={bookAppointment}>

              <label style={styles.label} htmlFor="patient-name">Full Name</label>

              <input id="patient-name" style={styles.input} type="text" name="patient_name" autoComplete="name" placeholder="Enter your full name" value={patient.patient_name} onChange={handlePatientChange} minLength={2} required />



              <label style={styles.label} htmlFor="patient-email">Email</label>

              <input id="patient-email" style={styles.input} type="email" name="email" autoComplete="email" placeholder="name@example.com" value={patient.email} onChange={handlePatientChange} required />



              <label style={styles.label} htmlFor="patient-phone">Phone</label>

              <input id="patient-phone" style={styles.input} type="tel" name="phone" autoComplete="tel" placeholder="Enter phone number" value={patient.phone} onChange={handlePatientChange} required />



              <label style={styles.label} htmlFor="patient-dob">Date of Birth (optional)</label>

              <input id="patient-dob" style={styles.input} type="date" name="date_of_birth" autoComplete="bday" max={minimumDate} value={patient.date_of_birth} onChange={handlePatientChange} />



              <label style={styles.label} htmlFor="appointment-reason">Reason for Appointment (optional)</label>

              <textarea id="appointment-reason" style={styles.input} name="reason" value={patient.reason} onChange={handlePatientChange} rows={3} />

              <button type="submit" style={styles.button} disabled={booking}>{booking ? "Booking..." : "Book Appointment"}</button>

            </form>

          </section>}

        </>

      )}



      <section style={styles.section}>

        <h2 style={styles.heading}>5. My Appointment History</h2>

        <p>Enter the email address used when booking your appointment.</p>

        <form onSubmit={viewAppointmentHistory}>

          <label style={styles.label} htmlFor="history-email">Registered email</label>

          <input id="history-email" style={styles.input} type="email" placeholder="Enter your registered email" value={historyEmail} onChange={(event) => setHistoryEmail(event.target.value)} required />

          <button type="submit" style={styles.button} disabled={historyLoading}>{historyLoading ? "Loading..." : "View My Appointments"}</button>

        </form>

        {historyError && <p role="alert" style={styles.error}>{historyError}</p>}

        {historySearched && history.length === 0 && <p>No appointments found for this email.</p>}

        {history.map((appointment) => <article key={appointment.appointment_id} style={styles.card}>

          <h3 style={styles.heading}>Appointment #{appointment.appointment_id}</h3>

          <p><strong>Doctor:</strong> {appointment.doctor_name}</p>

          <p><strong>Specialization:</strong> {appointment.specialization}</p>

          <p><strong>Date:</strong> {String(appointment.appointment_date).slice(0, 10)}</p>

          <p><strong>Time:</strong> {String(appointment.appointment_time).slice(0, 5)}</p>

          <p><strong>Status:</strong> {appointment.status}</p>

          <p><strong>Reason:</strong> {appointment.reason || "Not specified"}</p>

        </article>)}

      </section>

      <footer style={styles.footer}>Doctor Appointment System</footer>

    </main>

  );

}



const styles = {

  main: { maxWidth: 850, width: "100%", margin: "24px auto", padding: 20, fontFamily: "Arial, sans-serif", color: "#1e293b", boxSizing: "border-box" },

  header: { textAlign: "center", marginBottom: 24 },

  title: { color: "#12345a", fontSize: 34, marginBottom: 8 },

  subtitle: { color: "#475569", marginTop: 0 },

  section: { border: "1px solid #dbe3ec", borderRadius: 10, padding: 20, marginBottom: 20, background: "#ffffff", color: "#1e293b", boxShadow: "0 3px 10px rgba(15,23,42,0.06)" },

  heading: { color: "#12345a", marginTop: 0 },

  card: { border: "1px solid #dbe3ec", borderRadius: 8, padding: 16, margin: "12px 0", background: "#fff", color: "#1e293b" },

  label: { display: "block", color: "#334155", fontWeight: 600, marginTop: 10 },

  input: { display: "block", width: "100%", boxSizing: "border-box", padding: 11, margin: "8px 0 16px", border: "1px solid #94a3b8", borderRadius: 6, fontSize: 15, color: "#1e293b", background: "#fff", colorScheme: "light" },

  button: { padding: "10px 16px", border: 0, borderRadius: 6, background: "#1769aa", color: "#fff", cursor: "pointer", fontSize: 14 },

  selectedButton: { padding: "10px 16px", border: 0, borderRadius: 6, background: "#16803c", color: "#fff", cursor: "pointer", fontSize: 14 },

  slots: { display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 },

  slotButton: { minWidth: 80, padding: "11px 14px", color: "#1e293b", background: "#fff", border: "1px solid #94a3b8", borderRadius: 6, cursor: "pointer", fontSize: 14 },

  selectedSlot: { minWidth: 80, padding: "10px 13px", color: "#12345a", background: "#b8e0ff", border: "2px solid #1769aa", borderRadius: 6, cursor: "pointer", fontSize: 14, fontWeight: "bold" },

  successCard: { border: "1px solid #8ac9a0", background: "#f0fff4", borderRadius: 10, padding: 20, marginBottom: 25, color: "#174d2b" },

  error: { color: "#b91c1c", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 6, padding: 10 },

  footer: { textAlign: "center", padding: 20, color: "#64748b" },

};



export default App;
