'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Activity, Users, Megaphone, Smartphone } from 'lucide-react';
import api from '@/lib/api';

// Types mimicking Backend Models
interface MessageLog {
  id: string;
  contact_phone: string;
  message_text: string;
  status: string;
  sent_at: string;
}

interface Campaign {
  id: string;
  name: string;
  status: string;
  total_contacts: number;
}

export default function Dashboard() {
  const [stats, setStats] = useState({
    totalContacts: 0,
    activeCampaigns: 0,
    messagesSent: 0,
    connectedPhones: 0,
  });
  const [recentLogs, setRecentLogs] = useState<MessageLog[]>([]);
  const [runningCampaigns, setRunningCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch basic lists to calculate stats
        // Note: In a real large app, you'd want dedicated stats endpoints to avoid fetching all data.
        const [contactsRes, campaignsRes, phonesRes, logsRes] = await Promise.all([
          api.get('/contacts/').catch(() => ({ data: [] })),   // Fallback to empty if fails
          api.get('/campaigns/').catch(() => ({ data: [] })),
          api.get('/phones/').catch(() => ({ data: [] })),
          api.get('/logs/').catch(() => ({ data: [] }))
        ]);

        // Handle Pagination (DRF returns {count: ..., results: ...} or just [...])
        const getCount = (res: any) => Array.isArray(res.data) ? res.data.length : (res.data.count || 0);
        const getResults = (res: any) => Array.isArray(res.data) ? res.data : (res.data.results || []);

        const contactsCount = getCount(contactsRes);
        const campaignsResults = getResults(campaignsRes);
        const logsResults = getResults(logsRes);
        const phonesCount = getCount(phonesRes);

        // Derived Stats
        const activeCampaigns = campaignsResults.filter((c: Campaign) => c.status === 'RUNNING');

        setStats({
          totalContacts: contactsCount,
          activeCampaigns: activeCampaigns.length,
          messagesSent: logsResults.length, // Total logs roughly equals sent messages
          connectedPhones: phonesCount
        });

        setRecentLogs(logsResults.slice(0, 5)); // Show first 5 logs
        setRunningCampaigns(activeCampaigns);

        setLoading(false);
      } catch (error) {
        console.error("Failed to fetch dashboard data", error);
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) {
    return <div className="p-8 text-center text-slate-500">Loading Dashboard...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Dashboard</h1>
        <p className="text-slate-500">Overview of your WhatsApp marketing performance.</p>
      </div>

      {/* Stats Row */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Contacts</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalContacts}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Campaigns</CardTitle>
            <Megaphone className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.activeCampaigns}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Messages Sent</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.messagesSent}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Connected Phones</CardTitle>
            <Smartphone className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.connectedPhones}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        {/* Recent Activity */}
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Contact</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentLogs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground">No recent activity.</TableCell>
                  </TableRow>
                ) : (
                  recentLogs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="font-medium">{log.contact_phone || 'Unknown'}</TableCell>
                      <TableCell className="truncate max-w-[200px]">{log.message_text}</TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${log.status === 'SENT' ? 'bg-blue-100 text-blue-800' :
                            log.status === 'DELIVERED' ? 'bg-green-100 text-green-800' :
                              'bg-red-100 text-red-800'
                          }`}>
                          {log.status}
                        </span>
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {new Date(log.sent_at).toLocaleTimeString()}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Campaign Progress */}
        <Card className="col-span-3">
          <CardHeader>
            <CardTitle>Active Campaigns</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-8">
              {runningCampaigns.map((campaign) => (
                <div key={campaign.id} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{campaign.name}</div>
                    {/* Since backend doesn't give accurate progress yet, we simplify */}
                    <div className="text-sm text-green-600">Running</div>
                  </div>
                  <div className="h-2 w-full rounded-full bg-green-100">
                    <div
                      className="h-2 rounded-full bg-green-500 animate-pulse"
                      style={{ width: `100%` }}
                    />
                  </div>
                </div>
              ))}
              {runningCampaigns.length === 0 && (
                <div className="text-center text-sm text-muted-foreground py-4">
                  No active campaigns.
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
