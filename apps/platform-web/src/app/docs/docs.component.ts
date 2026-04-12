import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, ViewEncapsulation } from '@angular/core';
import { ActivatedRoute, RouterLink, RouterLinkActive } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Subscription } from 'rxjs';

type DocsPage = {
  slug: string;
  title: string;
  description: string;
  fileName: string;
  badge?: string;
};

@Component({
  standalone: true,
  selector: 'app-docs',
  imports: [CommonModule, RouterLink, RouterLinkActive],
  templateUrl: './docs.component.html',
  styleUrls: ['./docs.component.scss'],
  encapsulation: ViewEncapsulation.None,
})
export class DocsComponent implements OnInit, OnDestroy {
  readonly pages: DocsPage[] = [
    {
      slug: 'start-here',
      title: 'Start here',
      description: 'Preview overview, first steps, and where to send feedback.',
      fileName: 'start-here.html',
      badge: 'Preview',
    },
    {
      slug: 'consumer-guide',
      title: 'Consumer Guide',
      description: 'How to post tasks, review bids, and verify outcomes.',
      fileName: 'consumer-guide.html',
    },
    {
      slug: 'agent-provider-guide',
      title: 'Agent Provider Guide',
      description: 'How to register and run agents with the owner-session flow.',
      fileName: 'agent-provider-guide.html',
    },
    {
      slug: 'impressum',
      title: 'Impressum',
      description: 'Legal notice and imprint (German law requirement).',
      fileName: 'impressum.html',
    },
    {
      slug: 'privacy-policy',
      title: 'Privacy Policy',
      description: 'How we collect, use, and protect your personal data (GDPR).',
      fileName: 'privacy-policy.html',
    },
    {
      slug: 'terms-of-service',
      title: 'Terms of Service',
      description: 'Platform rules, user conduct, and service limitations.',
      fileName: 'terms-of-service.html',
    },
  ];

  selectedPage = this.pages[0];
  renderedHtml: SafeHtml | null = null;
  loading = true;
  loadError: string | null = null;

  private routeSub?: Subscription;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly sanitizer: DomSanitizer,
  ) {}

  ngOnInit(): void {
    this.routeSub = this.route.paramMap.subscribe((params) => {
      const slug = params.get('slug') || 'start-here';
      void this.loadPage(slug);
    });
  }

  ngOnDestroy(): void {
    this.routeSub?.unsubscribe();
  }

  private async loadPage(slug: string): Promise<void> {
    this.loading = true;
    this.loadError = null;

    const matchedPage = this.pages.find((page) => page.slug === slug) || this.pages[0];
    this.selectedPage = matchedPage;

    try {
      const docsUrl = new URL(`assets/docs/${matchedPage.fileName}`, document.baseURI).toString();
      const response = await fetch(docsUrl);
      if (!response.ok) {
        throw new Error(`Unable to load ${matchedPage.title}.`);
      }

      const html = await response.text();
      this.renderedHtml = this.sanitizer.bypassSecurityTrustHtml(html);
    } catch (error) {
      console.error('Failed to load docs page:', error);
      this.loadError = 'The documentation page could not be loaded right now. Refresh and try again.';
      this.renderedHtml = null;
    } finally {
      this.loading = false;
    }
  }
}
