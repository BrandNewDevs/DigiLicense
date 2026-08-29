import {
  BadgeCheck,
  CalendarClock,
  CalendarDays,
  ClipboardCheck,
  Copy,
  FilePenLine,
  FileSearch,
  IndianRupee,
  MapPinned,
  Smartphone,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

import type { ServiceId } from "../lib/services"

const serviceIcons: Record<ServiceId, LucideIcon> = {
  "learner-licence": FilePenLine,
  "learner-test": ClipboardCheck,
  "permanent-licence": BadgeCheck,
  "renew-licence": CalendarClock,
  "duplicate-licence": Copy,
  "change-address": MapPinned,
  "update-mobile": Smartphone,
  "track-application": FileSearch,
  fees: IndianRupee,
  appointments: CalendarDays,
}

function ServiceIcon({
  className = "size-5",
  serviceId,
}: {
  className?: string
  serviceId: ServiceId | string
}) {
  const Icon = Object.prototype.hasOwnProperty.call(serviceIcons, serviceId)
    ? serviceIcons[serviceId as ServiceId]
    : FilePenLine

  return <Icon aria-hidden="true" className={className} />
}

export { ServiceIcon }
