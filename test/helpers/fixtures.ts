import type { Audience, CategoryId, Depth } from '../../shared/questions/types';

interface Fixture {
  id: string;
  category: CategoryId;
  depth: Depth;
  text: string;
  audience?: Audience;
}

/** A small, predictable bank for API tests (the real seed bank is validated separately). */
export const FIXTURE_QUESTIONS: Fixture[] = [
  { id: 'love-maps-001', category: 'love-maps', depth: 1, text: 'What has been on your mind most this week, and why?' },
  { id: 'love-maps-002', category: 'love-maps', depth: 2, text: 'What is something you wish {partner} understood about your work?' },
  { id: 'love-maps-003', category: 'love-maps', depth: 3, text: 'What fear have you never fully said out loud to {partner}?' },
  { id: 'appreciation-001', category: 'appreciation', depth: 1, text: 'What did {partner} do recently that you admired?' },
  { id: 'appreciation-002', category: 'appreciation', depth: 2, text: 'Which quality of {partner}’s do you hope never changes?' },
  { id: 'connection-001', category: 'connection', depth: 1, text: 'How do you most like {partner} to greet you after a long day?' },
  { id: 'conflict-001', category: 'conflict', depth: 1, text: 'What helps you calm down when a conversation gets heated?' },
  { id: 'conflict-002', category: 'conflict', depth: 3, text: 'What is underneath the disagreement we keep circling back to?' },
  { id: 'growth-001', category: 'growth', depth: 1, text: 'What is something new you would love us to try together this year?' },
  { id: 'checkin-001', category: 'checkin', depth: 1, text: 'What has felt good between us lately?' },
  { id: 'checkin-002', category: 'checkin', depth: 2, text: 'What is one thing that would help you feel more supported this week?' },
  { id: 'marriage-001', category: 'marriage', depth: 1, audience: 'unmarried', text: 'If we got married, what would you want to stay exactly the same?' },
  { id: 'marriage-002', category: 'marriage', depth: 2, audience: 'married', text: 'How has being married changed how you see us?' },
  { id: 'kids-001', category: 'kids', depth: 1, audience: 'no-kids', text: 'If we had kids, what kind of parent do you imagine you would be?' },
  { id: 'kids-002', category: 'kids', depth: 1, audience: 'parents', text: 'What have our kids taught you about yourself?' },
  { id: 'home-001', category: 'home', depth: 1, audience: 'apart', text: 'If we lived together, what would make the place feel like ours?' },
  { id: 'home-002', category: 'home', depth: 1, audience: 'together', text: 'What part of our home life is working especially well?' },
  { id: 'intimacy-001', category: 'intimacy', depth: 1, text: 'What helps you feel most desired by {partner}?' },
];
