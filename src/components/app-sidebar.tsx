"use client"

import * as React from "react"

import { NavMain } from "@/components/nav-main"
import { NavUser } from "@/components/nav-user"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@/components/ui/sidebar"
import { TerminalSquareIcon, BotIcon, BarChart3Icon } from "lucide-react"

// This is sample data.
const data = {
  user: {
    name: "Paul Greetham",
    email: "pgreetham@protonmail.com",
    avatar: "",
  },
  navMain: [
    {
      title: "Input Data",
      url: "/dashboard/input-data/matches",
      icon: (
        <TerminalSquareIcon
        />
      ),
      isActive: true,
      items: [
        {
          title: "Matches",
          url: "/dashboard/input-data/matches",
        },
        {
          title: "Bets",
          url: "/dashboard/input-data/bets",
        },
        {
          title: "Results",
          url: "/dashboard/input-data/results",
        },
      ],
    },
    {
      title: "Analytics",
      url: "/dashboard/analytics/graphs",
      icon: (
        <BotIcon
        />
      ),
      items: [
        {
          title: "Graphs",
          url: "/dashboard/analytics/graphs",
        },
        {
          title: "Tables",
          url: "/dashboard/analytics/tables",
        },
        {
          title: "Totals",
          url: "/dashboard/analytics/totals",
        },
      ],
    },
  ],
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1">
          <BarChart3Icon className="size-4 shrink-0" />
          <span className="truncate text-sm font-semibold group-data-[collapsible=icon]:hidden">
            Odds Forecast Dashboard
          </span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={data.user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
