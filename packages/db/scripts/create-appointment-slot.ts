import { prisma } from "../src/db.ts"

const allowedZones = new Set([
  "CENTRAL_DELHI",
  "EAST_DELHI",
  "NORTH_DELHI",
  "SOUTH_DELHI",
])
const allowedVehicleClasses = new Set([
  "MOTORCYCLE_WITHOUT_GEAR",
  "MOTORCYCLE_WITH_GEAR",
  "LIGHT_MOTOR_VEHICLE",
])

type SlotInput = {
  endsAt: Date
  inventoryKey: string
  startsAt: Date
  vehicleClass: string
  zone: string
}

function readOption(name: string): string {
  const optionIndex = process.argv.indexOf(`--${name}`)
  const value = optionIndex >= 0 ? process.argv[optionIndex + 1] : undefined
  if (!value || value.startsWith("--")) {
    throw new Error(`--${name} is required.`)
  }
  return value
}

function parseTimestamp(name: string): Date {
  const value = new Date(readOption(name))
  if (Number.isNaN(value.getTime())) {
    throw new Error(`--${name} must be an ISO-8601 timestamp.`)
  }
  return value
}

function readSlotInput(): SlotInput {
  const inventoryKey = readOption("inventory-key")
  const zone = readOption("zone")
  const vehicleClass = readOption("vehicle-class")
  const startsAt = parseTimestamp("starts-at")
  const endsAt = parseTimestamp("ends-at")

  if (!allowedZones.has(zone)) {
    throw new Error("--zone is not a supported Delhi zone.")
  }
  if (!allowedVehicleClasses.has(vehicleClass)) {
    throw new Error("--vehicle-class is not supported.")
  }
  if (endsAt <= startsAt) {
    throw new Error("--ends-at must be after --starts-at.")
  }

  return { endsAt, inventoryKey, startsAt, vehicleClass, zone }
}

try {
  const input = readSlotInput()
  const existing = await prisma.appointmentSlot.findUnique({
    where: { inventoryKey: input.inventoryKey },
    select: { id: true, status: true },
  })
  if (existing && existing.status !== "OPEN") {
    throw new Error("Only an open appointment slot can be changed.")
  }
  const slot = existing
    ? await prisma.appointmentSlot.update({
        where: { id: existing.id },
        data: {
          endsAt: input.endsAt,
          startsAt: input.startsAt,
          vehicleClass: input.vehicleClass,
          zone: input.zone,
        },
        select: { id: true, inventoryKey: true },
      })
    : await prisma.appointmentSlot.create({
        data: input,
        select: { id: true, inventoryKey: true },
      })
  console.info(
    JSON.stringify({
      event: "appointment_slot_recorded",
      inventoryKey: slot.inventoryKey,
      severity: "info",
      slotId: slot.id,
      timestamp: new Date().toISOString(),
    })
  )
} catch (error) {
  console.error(
    JSON.stringify({
      errorName: error instanceof Error ? error.name : "UnknownError",
      event: "appointment_slot_record_failed",
      severity: "error",
      timestamp: new Date().toISOString(),
    })
  )
  process.exitCode = 1
} finally {
  await prisma.$disconnect()
}
