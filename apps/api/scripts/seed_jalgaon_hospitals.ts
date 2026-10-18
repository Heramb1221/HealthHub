import { createDb } from "../src/db/client.js";

const DATABASE_URL = process.env.DATABASE_URL || "postgresql://postgres:Heramb%401221@localhost:5433/healthhub";
const db = createDb(DATABASE_URL);

const HOSPITALS = [
  {
    name: "Vanita Multispeciality Hospital",
    city: "Jalgaon",
    address: "Near Lakme Salon, Ring Road, Jalgaon, Maharashtra 425001",
    phone: "0257 299 4001",
    website: "http://www.vanitahospitals.com",
    timings: "Open 24 hours",
    locationUrl: "https://maps.app.goo.gl/CjTUoWTaFWgMifM37?g_st=aw",
    specialties: ["Multispeciality", "General Medicine", "Emergency Care", "Critical Care", "Surgery"],
  },
  {
    name: "Orchid Multi Superspeciality Hospital",
    city: "Jalgaon",
    address: "B8/2736, Doctor Chitre Marg, Jalgaon, MH",
    phone: "0257 222 9749",
    website: "https://orchidhospitaljalgaon.com",
    timings: "Open 24 hours",
    locationUrl: "https://maps.app.goo.gl/1GM33Vt4iBfPfPWt5?g_st=aw",
    specialties: ["Multi Superspeciality", "Cardiology", "Neurology", "General Surgery", "Orthopaedics"],
  },
  {
    name: "Chandak Hospital",
    city: "Jalgaon",
    address: "Bhusawal Road, Jalgaon, Maharashtra 425001",
    phone: "7020123173",
    website: null,
    timings: "Open 24 hours",
    locationUrl: "https://maps.app.goo.gl/6ssYUCyeMb6WrKb3A?g_st=aw",
    specialties: ["General Medicine", "Pediatrics", "Emergency Care"],
  },
  {
    name: "RL Hospital",
    city: "Jalgaon",
    address: "RL HOSPITAL PLOT NO2, NIVRUTTI NAGAR, OPPO. MANRAJ PARK, N-H NO-6, Jalgaon, Maharashtra 425001",
    phone: "9421791854",
    website: "https://rlhospitals.com/",
    timings: "Open 24 hours",
    locationUrl: "https://maps.app.goo.gl/dFmvP7rMfPgmWxqF8?g_st=aw",
    specialties: ["Multispeciality", "Orthopaedics", "Cardiology", "General Surgery"],
  },
  {
    name: "Ganpati Hospital",
    city: "Jalgaon",
    address: "Swatantra Chowk, above SBI bank near Ashwini medical, jalgaon",
    phone: "0257 222 7257",
    website: null,
    timings: "Open 24 hours",
    locationUrl: null,
    specialties: ["General Medicine", "Gynaecology", "Pediatrics"],
  },
];

const SLOT_DAYS = 14;
const SLOT_MINUTES = Array.from({ length: 14 }, (_, i) => 4 * 60 + i * 30); // 04:00 to 10:30 UTC, every 30 minutes

async function main() {
  console.log("Seeding Jalgaon hospitals...");

  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);

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
      console.log(`Created hospital: ${hospital.name} (${hospital.id})`);
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
      console.log(`Updated hospital: ${hospital.name} (${hospital.id})`);
    }

    const slots = [];
    for (let day = 1; day <= SLOT_DAYS; day += 1) {
      for (const minutes of SLOT_MINUTES) {
        const startsAt = new Date(start.getTime() + day * 86_400_000 + minutes * 60_000);
        slots.push({
          hospitalId: hospital.id,
          startsAt,
          endsAt: new Date(startsAt.getTime() + 30 * 60_000),
        });
      }
    }
    const createdSlots = await db.availabilitySlot.createMany({
      data: slots,
      skipDuplicates: true,
    });
    console.log(`  Added ${createdSlots.count} slots for ${hospital.name}`);
  }

  console.log("Seeding completed successfully!");
}

main()
  .catch((e) => {
    console.error("Error seeding hospitals:", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
