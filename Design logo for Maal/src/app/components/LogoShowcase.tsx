import { useState } from 'react';
import { Logo1 } from './Logo1';
import { Logo2 } from './Logo2';
import { Logo3 } from './Logo3';
import { Logo4 } from './Logo4';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';

interface LogoShowcaseProps {
  logoNumber: 1 | 2 | 3 | 4;
  title: string;
  description: string;
  colorScheme: string;
  style: string;
}

export function LogoShowcase({ logoNumber, title, description, colorScheme, style }: LogoShowcaseProps) {
  const [activeView, setActiveView] = useState<'web' | 'mobile' | 'icon'>('web');
  
  const LogoComponent = {
    1: Logo1,
    2: Logo2,
    3: Logo3,
    4: Logo4,
  }[logoNumber];

  return (
    <Card className="p-8 space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <h3 className="text-2xl font-semibold">{title}</h3>
          <Badge variant="outline">{style}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">{description}</p>
        <p className="text-xs text-muted-foreground font-medium">Colors: {colorScheme}</p>
      </div>

      {/* View Tabs */}
      <Tabs value={activeView} onValueChange={(v) => setActiveView(v as any)} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="web">Web Header</TabsTrigger>
          <TabsTrigger value="mobile">Mobile</TabsTrigger>
          <TabsTrigger value="icon">App Icon</TabsTrigger>
        </TabsList>

        {/* Web Header View */}
        <TabsContent value="web" className="mt-6">
          <div className="border rounded-lg overflow-hidden">
            <div className="bg-white px-8 py-4 flex items-center justify-between border-b">
              <LogoComponent size={40} variant="full" />
              <div className="flex gap-6 text-sm">
                <span className="text-slate-600">Dashboard</span>
                <span className="text-slate-600">Insights</span>
                <span className="text-slate-600">Goals</span>
              </div>
            </div>
            <div className="bg-slate-50 h-48 flex items-center justify-center text-slate-400 text-sm">
              Website content area
            </div>
          </div>
        </TabsContent>

        {/* Mobile View */}
        <TabsContent value="mobile" className="mt-6">
          <div className="max-w-[375px] mx-auto border rounded-2xl overflow-hidden shadow-xl">
            <div className="bg-white px-4 py-3 flex items-center justify-between border-b">
              <LogoComponent size={32} variant="full" />
              <div className="w-6 h-6 flex flex-col gap-1 justify-center">
                <div className="h-0.5 bg-slate-600"></div>
                <div className="h-0.5 bg-slate-600"></div>
                <div className="h-0.5 bg-slate-600"></div>
              </div>
            </div>
            <div className="bg-slate-50 h-[500px] flex items-center justify-center text-slate-400 text-sm">
              Mobile app content
            </div>
            <div className="bg-white border-t px-4 py-3 flex justify-around">
              <div className="text-xs text-slate-400">Home</div>
              <div className="text-xs text-slate-400">Wealth</div>
              <div className="text-xs text-slate-400">Goals</div>
              <div className="text-xs text-slate-400">Profile</div>
            </div>
          </div>
        </TabsContent>

        {/* App Icon View */}
        <TabsContent value="icon" className="mt-6">
          <div className="flex flex-col items-center gap-8">
            <div className="space-y-4">
              <div className="text-center">
                <p className="text-sm font-medium mb-3">iOS / Social Media</p>
                <div className="inline-block rounded-[22%] overflow-hidden shadow-2xl">
                  <LogoComponent size={180} variant="icon" />
                </div>
              </div>
              
              <div className="flex gap-6 justify-center">
                <div className="text-center">
                  <p className="text-xs text-muted-foreground mb-2">Small (60px)</p>
                  <div className="inline-block rounded-[22%] overflow-hidden shadow-lg">
                    <LogoComponent size={60} variant="icon" />
                  </div>
                </div>
                <div className="text-center">
                  <p className="text-xs text-muted-foreground mb-2">Medium (90px)</p>
                  <div className="inline-block rounded-[22%] overflow-hidden shadow-lg">
                    <LogoComponent size={90} variant="icon" />
                  </div>
                </div>
                <div className="text-center">
                  <p className="text-xs text-muted-foreground mb-2">Large (120px)</p>
                  <div className="inline-block rounded-[22%] overflow-hidden shadow-xl">
                    <LogoComponent size={120} variant="icon" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </Card>
  );
}
