# OSA Community Platform - Frontend Specification

> **Reference**: This document defines the Next.js frontend structure, components, and pages. Consult when developing frontend features.

---

## 1. Technology Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| Next.js | 14+ | React framework with App Router |
| React | 18+ | UI library |
| TypeScript | 5+ | Type safety |
| Tailwind CSS | 3+ | Styling |
| shadcn/ui | Latest | UI component library |
| TipTap | 2+ | Rich text editor |
| Zod | 3+ | Schema validation |
| SWR | 2+ | Data fetching/caching |
| Lucide React | Latest | Icons |

---

## 2. Route Structure

### Public Routes (Guest Access)

```
app/(public)/
├── page.tsx                    # Homepage
│   ├── Hero section
│   ├── Featured events
│   ├── Latest news
│   └── Membership CTA
│
├── events/
│   ├── page.tsx                # Events listing (ISR, 60s)
│   └── [slug]/
│       └── page.tsx            # Event detail (ISR, 60s)
│
├── news/
│   ├── page.tsx                # News listing (ISR, 60s)
│   └── [slug]/
│       └── page.tsx            # Article detail (ISR, 300s)
│
├── membership/
│   └── page.tsx                # Membership info & tiers
│
└── [slug]/
    └── page.tsx                # Static pages (About, Contact, etc.)
```

### Auth Routes

```
app/(auth)/
├── layout.tsx                  # Auth layout (centered, minimal)
│
├── login/
│   └── page.tsx                # Login page with OAuth buttons
│
├── register/
│   └── page.tsx                # Registration page
│
└── callback/
    └── page.tsx                # OAuth callback handler
```

### Member Routes (Protected)

```
app/(member)/
├── layout.tsx                  # Member layout with sidebar
│   └── Auth check middleware
│
├── dashboard/
│   └── page.tsx                # Member dashboard
│       ├── Quick stats
│       ├── Upcoming events
│       └── Recent activity
│
├── profile/
│   ├── page.tsx                # View profile
│   └── edit/
│       └── page.tsx            # Edit profile form
│
├── membership/
│   └── page.tsx                # Membership status & upgrade
│
└── my-events/
    └── page.tsx                # User's event registrations
        ├── Upcoming
        ├── Waitlisted
        └── Past
```

### Contributor Routes (Protected)

```
app/(contributor)/
├── layout.tsx                  # Contributor layout
│   └── Role check (CONTRIBUTOR+)
│
└── manage/
    ├── page.tsx                # Contributor dashboard
    │
    ├── events/
    │   ├── page.tsx            # Events list (own + all for admin)
    │   ├── new/
    │   │   └── page.tsx        # Create event form
    │   └── [id]/
    │       ├── page.tsx        # Event details + attendees
    │       └── edit/
    │           └── page.tsx    # Edit event form
    │
    ├── articles/
    │   ├── page.tsx            # Articles list
    │   ├── new/
    │   │   └── page.tsx        # Create article
    │   └── [id]/
    │       └── edit/
    │           └── page.tsx    # Edit article
    │
    └── pages/
        ├── page.tsx            # Static pages list
        ├── new/
        │   └── page.tsx        # Create page
        └── [id]/
            └── edit/
                └── page.tsx    # Edit page
```

### Admin Routes (Protected)

```
app/(admin)/
├── layout.tsx                  # Admin layout
│   └── Role check (ADMIN only)
│
└── admin/
    ├── page.tsx                # Admin dashboard
    │   ├── Stats overview
    │   ├── Recent signups
    │   └── Pending actions
    │
    ├── users/
    │   ├── page.tsx            # Users list with search/filter
    │   └── [id]/
    │       └── page.tsx        # User detail + role management
    │
    ├── memberships/
    │   ├── page.tsx            # Memberships list
    │   │   ├── Pending approvals
    │   │   └── Active/Expired
    │   └── types/
    │       └── page.tsx        # Membership types management
    │
    ├── categories/
    │   └── page.tsx            # Event categories management
    │
    └── settings/
        └── page.tsx            # System settings
```

---

## 3. Component Library

### Layout Components

```typescript
// components/layout/Header.tsx
interface HeaderProps {
  user?: User | null;
}

// Features:
// - Logo with link to home
// - Main navigation (Events, News, About)
// - Auth buttons (Login/Register) or User menu
// - Mobile hamburger menu

// components/layout/Footer.tsx
// - Copyright
// - Quick links
// - Social media links
// - Contact info

// components/layout/Sidebar.tsx
interface SidebarProps {
  items: NavItem[];
  currentPath: string;
}

// components/layout/DashboardLayout.tsx
// - Sidebar navigation
// - Header with user menu
// - Main content area
// - Breadcrumbs
```

### UI Components (shadcn/ui)

```
components/ui/
├── button.tsx
├── card.tsx
├── input.tsx
├── label.tsx
├── textarea.tsx
├── select.tsx
├── checkbox.tsx
├── radio-group.tsx
├── switch.tsx
├── dialog.tsx
├── dropdown-menu.tsx
├── avatar.tsx
├── badge.tsx
├── tabs.tsx
├── table.tsx
├── pagination.tsx
├── toast.tsx
├── skeleton.tsx
├── separator.tsx
├── sheet.tsx              # Mobile sidebar
├── command.tsx            # Search
├── calendar.tsx           # Date picker
└── form.tsx               # React Hook Form integration
```

### Feature Components

```typescript
// components/events/EventCard.tsx
interface EventCardProps {
  event: EventSummary;
  variant?: 'default' | 'compact' | 'featured';
}

// components/events/EventList.tsx
interface EventListProps {
  events: EventSummary[];
  loading?: boolean;
  emptyMessage?: string;
}

// components/events/EventRegistrationButton.tsx
interface EventRegistrationButtonProps {
  event: Event;
  userRegistration?: EventRegistration | null;
  userWaitlist?: WaitlistEntry | null;
}
// States: Register, Join Waitlist, Registered, Waitlisted, Full

// components/events/CategoryBadge.tsx
interface CategoryBadgeProps {
  category: EventCategory;
  size?: 'sm' | 'md';
}

// components/articles/ArticleCard.tsx
interface ArticleCardProps {
  article: ArticleSummary;
}

// components/membership/MembershipCard.tsx
interface MembershipCardProps {
  type: MembershipType;
  current?: boolean;
  onSelect?: () => void;
}

// components/membership/MembershipStatus.tsx
interface MembershipStatusProps {
  membership: Membership | null;
}
```

### Form Components

```typescript
// components/forms/ProfileForm.tsx
interface ProfileFormProps {
  initialData?: Profile;
  onSubmit: (data: UpdateProfileDto) => Promise<void>;
}
// Fields: firstName, lastName, spouseName, children[], address, phone

// components/forms/EventForm.tsx
interface EventFormProps {
  initialData?: Event;
  categories: EventCategory[];
  onSubmit: (data: CreateEventDto | UpdateEventDto) => Promise<void>;
}

// components/forms/ArticleForm.tsx
interface ArticleFormProps {
  initialData?: Article;
  onSubmit: (data: CreateArticleDto | UpdateArticleDto) => Promise<void>;
}

// components/forms/AddressInput.tsx
interface AddressInputProps {
  value: Address;
  onChange: (address: Address) => void;
}
// Fields: street, city, state, zip, country

// components/forms/ChildrenInput.tsx
interface ChildrenInputProps {
  value: Child[];
  onChange: (children: Child[]) => void;
}
// Dynamic list of children with name, age, gender
```

### Editor Components

```typescript
// components/editor/RichTextEditor.tsx
interface RichTextEditorProps {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
}

// Features:
// - Headings (H1, H2, H3)
// - Bold, Italic, Underline
// - Lists (bullet, numbered)
// - Links
// - Images (upload to Supabase Storage)
// - Blockquotes
// - Code blocks

// components/editor/Toolbar.tsx
// Formatting buttons

// components/editor/ImageUpload.tsx
interface ImageUploadProps {
  onUpload: (url: string) => void;
  accept?: string;
  maxSize?: number; // MB
}
```

---

## 4. Page Implementations

### Homepage

```typescript
// app/(public)/page.tsx

import { Suspense } from 'react';
import { HeroSection } from '@/components/home/HeroSection';
import { FeaturedEvents } from '@/components/home/FeaturedEvents';
import { LatestNews } from '@/components/home/LatestNews';
import { MembershipCTA } from '@/components/home/MembershipCTA';
import { EventCardSkeleton } from '@/components/events/EventCardSkeleton';

export const revalidate = 60; // ISR: Revalidate every 60 seconds

export default async function HomePage() {
  return (
    <main>
      <HeroSection />
      
      <section className="py-16">
        <div className="container">
          <h2 className="text-3xl font-bold mb-8">Upcoming Events</h2>
          <Suspense fallback={<EventCardSkeleton count={3} />}>
            <FeaturedEvents />
          </Suspense>
        </div>
      </section>

      <section className="py-16 bg-muted">
        <div className="container">
          <h2 className="text-3xl font-bold mb-8">Latest News</h2>
          <Suspense fallback={<ArticleCardSkeleton count={3} />}>
            <LatestNews />
          </Suspense>
        </div>
      </section>

      <MembershipCTA />
    </main>
  );
}
```

### Events List

```typescript
// app/(public)/events/page.tsx

import { Suspense } from 'react';
import { EventList } from '@/components/events/EventList';
import { EventFilters } from '@/components/events/EventFilters';
import { getEvents, getCategories } from '@/lib/api';

export const revalidate = 60;

interface EventsPageProps {
  searchParams: {
    category?: string;
    page?: string;
  };
}

export default async function EventsPage({ searchParams }: EventsPageProps) {
  const [eventsData, categories] = await Promise.all([
    getEvents({
      category: searchParams.category,
      page: parseInt(searchParams.page || '1'),
      status: 'PUBLISHED',
      upcoming: true,
    }),
    getCategories(),
  ]);

  return (
    <div className="container py-8">
      <h1 className="text-4xl font-bold mb-8">Events</h1>
      
      <div className="flex flex-col lg:flex-row gap-8">
        <aside className="w-full lg:w-64 shrink-0">
          <EventFilters 
            categories={categories}
            selectedCategory={searchParams.category}
          />
        </aside>
        
        <main className="flex-1">
          <EventList 
            events={eventsData.data} 
            pagination={eventsData.meta}
          />
        </main>
      </div>
    </div>
  );
}
```

### Event Detail

```typescript
// app/(public)/events/[slug]/page.tsx

import { notFound } from 'next/navigation';
import { getEvent, getEventRegistrationStatus } from '@/lib/api';
import { EventHeader } from '@/components/events/EventHeader';
import { EventContent } from '@/components/events/EventContent';
import { EventSidebar } from '@/components/events/EventSidebar';
import { EventRegistrationButton } from '@/components/events/EventRegistrationButton';
import { getCurrentUser } from '@/lib/auth';

export const revalidate = 60;

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const event = await getEvent(params.slug);
  if (!event) return {};
  
  return {
    title: `${event.title} | OSA Events`,
    description: event.excerpt,
    openGraph: {
      images: event.featuredImage ? [event.featuredImage] : [],
    },
  };
}

export default async function EventPage({ params }: { params: { slug: string } }) {
  const event = await getEvent(params.slug);
  
  if (!event) {
    notFound();
  }

  const user = await getCurrentUser();
  let registrationStatus = null;
  
  if (user) {
    registrationStatus = await getEventRegistrationStatus(event.id);
  }

  return (
    <div className="container py-8">
      <div className="grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <EventHeader event={event} />
          <EventContent content={event.content} />
        </div>
        
        <aside className="space-y-6">
          <EventSidebar event={event} />
          <EventRegistrationButton 
            event={event}
            user={user}
            registration={registrationStatus?.registration}
            waitlist={registrationStatus?.waitlist}
          />
        </aside>
      </div>
    </div>
  );
}
```

### Member Dashboard

```typescript
// app/(member)/dashboard/page.tsx

import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { getMyMembership, getMyUpcomingEvents } from '@/lib/api';
import { DashboardStats } from '@/components/dashboard/DashboardStats';
import { UpcomingEvents } from '@/components/dashboard/UpcomingEvents';
import { MembershipCard } from '@/components/dashboard/MembershipCard';

export default async function DashboardPage() {
  const user = await getCurrentUser();
  
  if (!user) {
    redirect('/login');
  }

  const [membership, upcomingEvents] = await Promise.all([
    getMyMembership(),
    getMyUpcomingEvents(),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Welcome, {user.profile?.firstName || 'Member'}!</h1>
        <p className="text-muted-foreground">Here's what's happening with your account.</p>
      </div>

      <DashboardStats />

      <div className="grid lg:grid-cols-2 gap-8">
        <div>
          <h2 className="text-xl font-semibold mb-4">Your Upcoming Events</h2>
          <UpcomingEvents events={upcomingEvents} />
        </div>
        
        <div>
          <h2 className="text-xl font-semibold mb-4">Membership Status</h2>
          <MembershipCard membership={membership} />
        </div>
      </div>
    </div>
  );
}
```

---

## 5. Authentication Flow

### Supabase Auth Setup

```typescript
// lib/supabase/client.ts (Browser)

import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

// lib/supabase/server.ts (Server Components)

import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

export function createClient() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          cookieStore.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          cookieStore.set({ name, value: '', ...options });
        },
      },
    }
  );
}
```

### Edge Middleware

```typescript
// middleware.ts

import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// Routes that require authentication
const protectedRoutes = ['/dashboard', '/profile', '/my-events', '/manage', '/admin'];

// Routes that require specific roles
const roleRoutes = {
  '/manage': ['CONTRIBUTOR', 'ADMIN'],
  '/admin': ['ADMIN'],
};

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          response.cookies.set({ name, value: '', ...options });
        },
      },
    }
  );

  const { data: { session } } = await supabase.auth.getSession();
  const pathname = request.nextUrl.pathname;

  // Check if route requires authentication
  const isProtected = protectedRoutes.some(route => pathname.startsWith(route));
  
  if (isProtected && !session) {
    const redirectUrl = new URL('/login', request.url);
    redirectUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(redirectUrl);
  }

  // Check role-based access
  // Note: For security, role check should also happen server-side
  // This is just for UX to redirect early

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/webhooks).*)',
  ],
};
```

### Login Page

```typescript
// app/(auth)/login/page.tsx

'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Icons } from '@/components/icons';

export default function LoginPage() {
  const [loading, setLoading] = useState<'google' | 'microsoft' | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect') || '/dashboard';
  
  const supabase = createClient();

  const handleOAuthLogin = async (provider: 'google' | 'azure') => {
    setLoading(provider === 'google' ? 'google' : 'microsoft');
    
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/callback?redirect=${redirect}`,
      },
    });

    if (error) {
      console.error('OAuth error:', error);
      setLoading(null);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-md space-y-8 px-4">
        <div className="text-center">
          <h1 className="text-3xl font-bold">Welcome to OSA</h1>
          <p className="text-muted-foreground mt-2">
            Sign in to access member features
          </p>
        </div>

        <div className="space-y-4">
          <Button
            variant="outline"
            className="w-full"
            onClick={() => handleOAuthLogin('google')}
            disabled={loading !== null}
          >
            {loading === 'google' ? (
              <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Icons.google className="mr-2 h-4 w-4" />
            )}
            Continue with Google
          </Button>

          <Button
            variant="outline"
            className="w-full"
            onClick={() => handleOAuthLogin('azure')}
            disabled={loading !== null}
          >
            {loading === 'microsoft' ? (
              <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Icons.microsoft className="mr-2 h-4 w-4" />
            )}
            Continue with Microsoft
          </Button>
        </div>

        <p className="text-center text-sm text-muted-foreground">
          By continuing, you agree to our{' '}
          <a href="/terms-of-service" className="underline">Terms</a> and{' '}
          <a href="/privacy-policy" className="underline">Privacy Policy</a>.
        </p>
      </div>
    </div>
  );
}
```

---

## 6. TipTap Editor Implementation

```typescript
// components/editor/RichTextEditor.tsx

'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { Toolbar } from './Toolbar';
import { ImageUploadButton } from './ImageUploadButton';

interface RichTextEditorProps {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
}

export function RichTextEditor({ content, onChange, placeholder }: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Image.configure({
        HTMLAttributes: {
          class: 'rounded-lg max-w-full',
        },
      }),
      Link.configure({
        openOnClick: false,
      }),
      Placeholder.configure({
        placeholder: placeholder || 'Start writing...',
      }),
    ],
    content,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm sm:prose lg:prose-lg focus:outline-none min-h-[200px] p-4',
      },
    },
  });

  const handleImageUpload = async (url: string) => {
    editor?.chain().focus().setImage({ src: url }).run();
  };

  if (!editor) return null;

  return (
    <div className="border rounded-lg overflow-hidden">
      <Toolbar editor={editor} />
      <div className="border-t">
        <EditorContent editor={editor} />
      </div>
      <div className="border-t p-2 flex justify-end">
        <ImageUploadButton onUpload={handleImageUpload} />
      </div>
    </div>
  );
}

// components/editor/Toolbar.tsx

import { Editor } from '@tiptap/react';
import { Toggle } from '@/components/ui/toggle';
import {
  Bold,
  Italic,
  List,
  ListOrdered,
  Quote,
  Heading1,
  Heading2,
  Heading3,
  Link,
  Undo,
  Redo,
} from 'lucide-react';

interface ToolbarProps {
  editor: Editor;
}

export function Toolbar({ editor }: ToolbarProps) {
  return (
    <div className="flex flex-wrap gap-1 p-2 bg-muted/50">
      <Toggle
        size="sm"
        pressed={editor.isActive('bold')}
        onPressedChange={() => editor.chain().focus().toggleBold().run()}
      >
        <Bold className="h-4 w-4" />
      </Toggle>
      
      <Toggle
        size="sm"
        pressed={editor.isActive('italic')}
        onPressedChange={() => editor.chain().focus().toggleItalic().run()}
      >
        <Italic className="h-4 w-4" />
      </Toggle>

      <Toggle
        size="sm"
        pressed={editor.isActive('heading', { level: 1 })}
        onPressedChange={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
      >
        <Heading1 className="h-4 w-4" />
      </Toggle>

      <Toggle
        size="sm"
        pressed={editor.isActive('heading', { level: 2 })}
        onPressedChange={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      >
        <Heading2 className="h-4 w-4" />
      </Toggle>

      <Toggle
        size="sm"
        pressed={editor.isActive('bulletList')}
        onPressedChange={() => editor.chain().focus().toggleBulletList().run()}
      >
        <List className="h-4 w-4" />
      </Toggle>

      <Toggle
        size="sm"
        pressed={editor.isActive('orderedList')}
        onPressedChange={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <ListOrdered className="h-4 w-4" />
      </Toggle>

      <Toggle
        size="sm"
        pressed={editor.isActive('blockquote')}
        onPressedChange={() => editor.chain().focus().toggleBlockquote().run()}
      >
        <Quote className="h-4 w-4" />
      </Toggle>

      <div className="flex-1" />

      <Toggle size="sm" onPressedChange={() => editor.chain().focus().undo().run()}>
        <Undo className="h-4 w-4" />
      </Toggle>

      <Toggle size="sm" onPressedChange={() => editor.chain().focus().redo().run()}>
        <Redo className="h-4 w-4" />
      </Toggle>
    </div>
  );
}
```

---

## 7. API Client

```typescript
// lib/api/client.ts

import { createClient } from '@/lib/supabase/server';

const API_URL = process.env.API_URL || 'http://localhost:3001';

interface FetchOptions extends RequestInit {
  token?: string;
}

async function getAuthToken(): Promise<string | null> {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token || null;
}

export async function apiClient<T>(
  endpoint: string,
  options: FetchOptions = {}
): Promise<T> {
  const token = options.token || await getAuthToken();
  
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Request failed' }));
    throw new Error(error.message || `HTTP ${response.status}`);
  }

  return response.json();
}

// Convenience methods
export const api = {
  get: <T>(endpoint: string, options?: FetchOptions) => 
    apiClient<T>(endpoint, { ...options, method: 'GET' }),
  
  post: <T>(endpoint: string, data?: unknown, options?: FetchOptions) =>
    apiClient<T>(endpoint, { ...options, method: 'POST', body: JSON.stringify(data) }),
  
  patch: <T>(endpoint: string, data?: unknown, options?: FetchOptions) =>
    apiClient<T>(endpoint, { ...options, method: 'PATCH', body: JSON.stringify(data) }),
  
  delete: <T>(endpoint: string, options?: FetchOptions) =>
    apiClient<T>(endpoint, { ...options, method: 'DELETE' }),
};

// Typed API functions
export const getEvents = (params?: EventsQueryParams) => 
  api.get<PaginatedResponse<EventSummary>>(`/events?${new URLSearchParams(params as any)}`);

export const getEvent = (slug: string) => 
  api.get<Event>(`/events/${slug}`);

export const getCategories = () => 
  api.get<EventCategory[]>('/event-categories');

export const registerForEvent = (eventId: string) =>
  api.post<RegistrationResponse>(`/events/${eventId}/register`);

export const getMyMembership = () =>
  api.get<Membership | null>('/memberships/my');

export const getMyUpcomingEvents = () =>
  api.get<EventRegistration[]>('/my-events?upcoming=true');
```

---

## 8. Responsive Design

### Breakpoints (Tailwind defaults)

```
sm: 640px   - Mobile landscape
md: 768px   - Tablet
lg: 1024px  - Desktop
xl: 1280px  - Large desktop
2xl: 1536px - Extra large
```

### Mobile-First Patterns

```tsx
// Grid that stacks on mobile
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
  {events.map(event => <EventCard key={event.id} event={event} />)}
</div>

// Sidebar that becomes bottom sheet on mobile
<div className="fixed bottom-0 left-0 right-0 md:relative md:bottom-auto">
  <Sidebar />
</div>

// Navigation that collapses to hamburger
<nav className="hidden md:flex items-center gap-6">
  <NavItems />
</nav>
<Sheet className="md:hidden">
  <MobileMenu />
</Sheet>
```

### Touch-Friendly Targets

```tsx
// Minimum 44x44px touch targets
<Button className="min-h-[44px] min-w-[44px]">Click</Button>

// Adequate spacing between interactive elements
<div className="space-y-3"> {/* 12px minimum */}
  <Button>Action 1</Button>
  <Button>Action 2</Button>
</div>
```
