type AppointmentClock = {
  now: () => Date
}

const systemAppointmentClock: AppointmentClock = {
  now: () => new Date(),
}

function createFixedAppointmentClock(value: Date): AppointmentClock {
  const fixedTimestamp = value.getTime()

  return {
    now: () => new Date(fixedTimestamp),
  }
}

export { createFixedAppointmentClock, systemAppointmentClock }
export type { AppointmentClock }
