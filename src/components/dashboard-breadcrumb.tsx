"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

function formatSegment(segment: string) {
  if (segment === "graphs") {
    return "Metrics";
  }

  return segment
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function DashboardBreadcrumb() {
  const pathname = usePathname();
  const pathSegments = pathname.split("/").filter(Boolean);
  const dashboardIndex = pathSegments.indexOf("dashboard");
  const routeSegments =
    dashboardIndex >= 0 ? pathSegments.slice(dashboardIndex + 1) : [];

  const crumbs = routeSegments.map((segment, index) => ({
    label: formatSegment(segment),
    href: `/dashboard/${routeSegments.slice(0, index + 1).join("/")}`,
    isLast: index === routeSegments.length - 1,
  }));

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {crumbs.length === 0 ? (
          <BreadcrumbItem>
            <BreadcrumbPage>Dashboard</BreadcrumbPage>
          </BreadcrumbItem>
        ) : (
          <>
            <BreadcrumbItem className="hidden md:block">
              <BreadcrumbLink render={<Link href="/dashboard" />}>
                Dashboard
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator className="hidden md:block" />
            {crumbs.flatMap((crumb) => [
              <BreadcrumbItem key={`item-${crumb.href}`}>
                {crumb.isLast ? (
                  <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink render={<Link href={crumb.href} />}>
                    {crumb.label}
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>,
              !crumb.isLast ? (
                <BreadcrumbSeparator key={`sep-${crumb.href}`} />
              ) : null,
            ])}
          </>
        )}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
