import { Outlet, createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/services")({
  component: ServicesLayout,
})

function ServicesLayout() {
  return <Outlet />
}
