import { prisma } from "../src/db"
import { purgeExpiredAddressChangeVerifications } from "../src/address-change-retention"

try {
  const result = await purgeExpiredAddressChangeVerifications()
  console.log(
    `Purged ${result.deleted} expired synthetic address-change verifications in ${result.batches} batch(es).`
  )
} finally {
  await prisma.$disconnect()
}
