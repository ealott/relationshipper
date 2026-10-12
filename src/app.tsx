import { useEffect, useState } from 'preact/hooks';
import { LocationProvider, Route, Router, useLocation } from 'preact-iso';
import { SystemBanners, Toaster } from './components/Feedback';
import { Raccoon } from './components/Raccoon';
import { TabBar } from './components/TabBar';
import { idsWithStatus, useJournal, useProgress } from './lib/data';
import { getFlag, setAppBadge, setFlag } from './lib/platform';
import { checkDeviceSubscription } from './lib/push';
import { loadSession, useMe, useSession } from './lib/session';
import { Admin } from './pages/Admin';
import { Answers } from './pages/Answers';
import { CategoryPage } from './pages/Category';
import { Join } from './pages/Join';
import { Journal, JournalDayPage } from './pages/Journal';
import { Library } from './pages/Library';
import { NotFound } from './pages/NotFound';
import { Pair } from './pages/Pair';
import { QuestionPage } from './pages/QuestionPage';
import { Research } from './pages/Research';
import { Settings } from './pages/Settings';
import { StageSetup } from './pages/Stage';
import { Today } from './pages/Today';
import { Welcome } from './pages/Welcome';
import { WriteQuestion } from './pages/WriteQuestion';

function Redirect({ to }: { to: string }) {
  const { route } = useLocation();
  useEffect(() => route(to, true), [to]);
  return null;
}

/** Lets the service worker (notification taps) navigate inside the app. */
function NavigationBridge() {
  const { route } = useLocation();
  useEffect(() => {
    const onNavigate = (e: Event) => route((e as CustomEvent<string>).detail);
    window.addEventListener('app:navigate', onNavigate);
    return () => window.removeEventListener('app:navigate', onNavigate);
  }, [route]);
  return null;
}

const scrollToTop = () => window.scrollTo(0, 0);

function PairedApp() {
  const me = useMe();
  const { path } = useLocation();
  const progress = useProgress();
  const yourTurn = idsWithStatus(progress.data?.progress, 'partner').length;
  const journal = useJournal();
  const journalTurn = journal.data?.days.filter((d) => d.state.partnerAnswered && !d.state.mine).length ?? 0;
  const couple = me.couple!;
  const skipKey = `stage-skipped:${couple.id}`;
  const [skipped, setSkipped] = useState(() => getFlag(skipKey) === '1');
  const stageMissing = couple.married === null || couple.livingTogether === null || couple.hasKids === null;

  useEffect(() => setAppBadge(yourTurn), [yourTurn]);
  useEffect(() => {
    void checkDeviceSubscription();
  }, []);

  if (stageMissing && !skipped && !path.startsWith('/research') && !path.startsWith('/admin')) {
    return (
      <StageSetup
        onDone={() => {
          setFlag(skipKey, '1');
          setSkipped(true);
        }}
      />
    );
  }

  return (
    <>
      <Router onRouteChange={scrollToTop}>
        <Route path="/" component={Today} />
        <Route path="/today" component={Today} />
        <Route path="/questions" component={Library} />
        <Route path="/questions/new" component={WriteQuestion} />
        <Route path="/questions/:category" component={CategoryPage} />
        <Route path="/q/:id" component={QuestionPage} />
        <Route path="/journal" component={Journal} />
        <Route path="/journal/:day" component={JournalDayPage} />
        <Route path="/answers" component={Answers} />
        <Route path="/settings" component={Settings} />
        <Route path="/research" component={Research} />
        <Route path="/admin" component={Admin} />
        <Route path="/join/:code" component={Join} />
        <Route default component={NotFound} />
      </Router>
      <TabBar badges={{ '/answers': yourTurn, '/journal': journalTurn }} />
    </>
  );
}

function Routes() {
  const session = useSession();
  if (session.status === 'loading') {
    return (
      <div class="splash" aria-label="Loading">
        <div class="logo logo--pulse">
          <Raccoon size={50} />
        </div>
      </div>
    );
  }
  if (session.status === 'signed-out') {
    return (
      <Router onRouteChange={scrollToTop}>
        <Route path="/" component={Welcome} />
        <Route path="/join/:code" component={Join} />
        <Route path="/research" component={Research} />
        <Route default component={() => <Redirect to="/" />} />
      </Router>
    );
  }
  if (!session.me.couple) {
    return (
      <Router onRouteChange={scrollToTop}>
        <Route path="/join/:code" component={Join} />
        <Route path="/research" component={Research} />
        <Route path="/admin" component={Admin} />
        <Route default component={Pair} />
      </Router>
    );
  }
  return <PairedApp />;
}

export function App() {
  useEffect(() => {
    void loadSession();
  }, []);
  return (
    <LocationProvider>
      <NavigationBridge />
      <SystemBanners />
      <Routes />
      <Toaster />
    </LocationProvider>
  );
}
