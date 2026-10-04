import { NgDocMembersComponent } from '@ng-doc/app/components/members';
import { NgDocPageProcessor } from '@ng-doc/app/interfaces';

/** Adds the member filter to the members table of an API page (`<ng-doc-members>`). */
export const membersProcessor: NgDocPageProcessor<NgDocMembersComponent> = {
  component: NgDocMembersComponent,
  selector: 'ng-doc-members',
  extractOptions: (element: Element) => ({
    content: [Array.from(element.childNodes)],
  }),
};
