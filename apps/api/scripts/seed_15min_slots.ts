import { createDb } from "../src/db/client.js";

const DATABASE_URL = process.env.DATABASE_URL || "postgresql://postgres:Heramb%401221@localhost:5433/healthhub";
const db = createDb(DATABASE_URL);

interface HospitalSpec {
  name: string;
  city: string;
  address: string;
  phone: string;
  website: string | null;
  timings: string;
  locationUrl: string | null;
  specialties: string[];
}

const HOSPITALS: HospitalSpec[] = [
  {
    name: "Vanita Multispeciality Hospital",
    city: "Jalgaon",
    address: "Near Lakme Salon, Ring Road, Jalgaon, Maharashtra 425001",
    phone: "0257 299 4001",
    website: "http://www.vanitahospitals.com",
    timings: "Open 24 hours (OPD 09:00 AM - 08:30 PM)",
    locationUrl: "https://maps.app.goo.gl/CjTUoWTaFWgMifM37?g_st=aw",
    specialties: ["Multispeciality", "General Medicine", "Emergency Care", "Critical Care", "Surgery"],
  },
  {
    name: "Orchid Multi Superspeciality Hospital",
    city: "Jalgaon",
    address: "B8/2736, Doctor Chitre Marg, Jalgaon, MH 425001",
    phone: "0257 222 9749",
    website: "https://orchidhospitaljalgaon.com",
    timings: "Open 24 hours (OPD 09:00 AM - 08:30 PM)",
    locationUrl: "https://maps.app.goo.gl/1GM33Vt4iBfPfPWt5?g_st=aw",
    specialties: ["Multi Superspeciality", "Cardiology", "Neurology", "General Surgery", "Orthopaedics"],
  },
  {
    name: "Chandak Hospital",
    city: "Jalgaon",
    address: "Bhusawal Road, Jalgaon, Maharashtra 425001",
    phone: "070201 23173",
    website: null,
    timings: "Open 24 hours (OPD 09:00 AM - 08:30 PM)",
    locationUrl: "https://maps.app.goo.gl/6ssYUCyeMb6WrKb3A?g_st=aw",
    specialties: ["General Medicine", "Pediatrics", "Emergency Care", "Orthopaedics"],
  },
  {
    name: "RL Hospital",
    city: "Jalgaon",
    address: "RL Hospital Plot No 2, Nivrutti Nagar, Opp. Manraj Park, N-H No-6, Jalgaon 425001",
    phone: "094217 91854",
    website: "https://rlhospitals.com/",
    timings: "Open 24 hours (OPD 09:00 AM - 08:30 PM)",
    locationUrl: "https://maps.app.goo.gl/dFmvP7rMfPgmWxqF8?g_st=aw",
    specialties: ["Multispeciality", "Orthopaedics", "Cardiology", "General Surgery"],
  },
  {
    name: "Ganpati Hospital",
    city: "Jalgaon",
    address: "Swatantra Chowk, Above SBI Bank near Ashwini Medical, Jalgaon 425001",
    phone: "0257 222 7257",
    website: null,
    timings: "OPD 09:00 AM - 08:30 PM",
    locationUrl: null,
    specialties: ["General Medicine", "Gynaecology", "Pediatrics"],
  },
  {
    name: "Apollo Multispeciality Medical Center",
    city: "Mumbai",
    address: "Plot No. 13, Off Eastern Express Highway, Chembur, Mumbai 400071",
    phone: "022 6912 0000",
    website: "https://www.apollohospitals.com",
    timings: "Open 24 hours (OPD 09:00 AM - 08:30 PM)",
    locationUrl: "https://maps.google.com/?q=Apollo+Hospital",
    specialties: ["Cardiology", "Oncology", "Neurology", "Endocrinology", "Gastroenterology"],
  },
  {
    name: "Fortis Escorts Hospital",
    city: "New Delhi",
    address: "Okhla Road, Sukhdev Vihar, New Delhi 110025",
    phone: "011 4713 5000",
    website: "https://www.fortishealthcare.com",
    timings: "Open 24 hours (OPD 09:00 AM - 08:30 PM)",
    locationUrl: "https://maps.google.com/?q=Fortis+Hospital",
    specialties: ["Cardiac Sciences", "Bone & Joint", "Pulmonology", "Nephrology", "Dermatology"],
  },
];

function generateDaily15MinOffsets(): { startOffsetMin: number; durationMin: number }[] {
  const intervals: { startOffsetMin: number; durationMin: number }[] = [];

  function addRange(startH: number, startM: number, endH: number, endM: number) {
    const startTotal = startH * 60 + startM;
    const endTotal = endH * 60 + endM;
    for (let m = startTotal; m < endTotal; m += 15) {
      intervals.push({ startOffsetMin: m, durationMin: 15 });
    }
  }

  addRange(3, 30, 7, 30);

  addRange(8, 30, 11, 30);

  addRange(12, 0, 15, 0);

  return intervals;
}

async function seed() {
  console.log("Starting 15-minute slot generation for hospitals...");

  const slotIntervals = generateDaily15MinOffsets();
  console.log(`Generated ${slotIntervals.length} 15-minute intervals per day.`);

  const DAYS_AHEAD = 14;
  const now = new Date();

  const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));

  for (const spec of HOSPITALS) {
    let hospital = await db.hospital.findFirst({ where: { name: spec.name } });
    if (!hospital) {
      hospital = await db.hospital.create({
        data: {
          name: spec.name,
          city: spec.city,
          address: spec.address,
          phone: spec.phone,
          website: spec.website,
          timings: spec.timings,
          locationUrl: spec.locationUrl,
          specialties: spec.specialties,
          isDemo: false,
          isActive: true,
        },
      });
      console.log(`+ Created hospital: ${hospital.name} (${hospital.id})`);
    } else {
      hospital = await db.hospital.update({
        where: { id: hospital.id },
        data: {
          city: spec.city,
          address: spec.address,
          phone: spec.phone,
          website: spec.website,
          timings: spec.timings,
          locationUrl: spec.locationUrl,
          specialties: spec.specialties,
          isActive: true,
        },
      });
      console.log(`* Updated hospital: ${hospital.name} (${hospital.id})`);
    }

    const slotsToInsert: { hospitalId: string; startsAt: Date; endsAt: Date }[] = [];

    for (let dayOffset = 0; dayOffset <= DAYS_AHEAD; dayOffset++) {
      const dayBaseMs = todayUtc.getTime() + dayOffset * 86_400_000;

      for (const interval of slotIntervals) {
        const startsAt = new Date(dayBaseMs + interval.startOffsetMin * 60_000);

        if (startsAt.getTime() > now.getTime() + 10 * 60_000) {
          const endsAt = new Date(startsAt.getTime() + interval.durationMin * 60_000);
          slotsToInsert.push({
            hospitalId: hospital.id,
            startsAt,
            endsAt,
          });
        }
      }
    }

    if (slotsToInsert.length > 0) {

      let insertedCount = 0;
      const chunkSize = 200;
      for (let i = 0; i < slotsToInsert.length; i += chunkSize) {
        const chunk = slotsToInsert.slice(i, i + chunkSize);
        const res = await db.availabilitySlot.createMany({
          data: chunk,
          skipDuplicates: true,
        });
        insertedCount += res.count;
      }
      console.log(`  -> Inserted ${insertedCount} future 15-minute slots for ${hospital.name}`);
    }
  }

  console.log("Seeding 15-minute slots completed successfully!");
}

seed()
  .catch((err) => {
    console.error("Seeding error:", err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
