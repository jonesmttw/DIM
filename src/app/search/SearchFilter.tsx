import * as React from 'react';
import { t } from 'i18next';
import { AppIcon, helpIcon, tagIcon, disabledIcon } from '../shell/icons';
import { itemTags, getItemInfoSource, TagValue } from '../inventory/dim-item-info';
import { connect } from 'react-redux';
import { querySelector } from '../shell/reducer';
import { RootState } from '../store/reducers';
import { setSearchQuery } from '../shell/actions';
import * as _ from 'lodash';
import { toaster, ngDialog, loadingTracker, hotkeys } from '../ngimport-more';
import filtersTemplate from '../search/filters.html';
import './search-filter.scss';
import { destinyVersionSelector, currentAccountSelector } from '../accounts/reducer';
import Textcomplete from 'textcomplete/lib/textcomplete';
import Textarea from 'textcomplete/lib/textarea';
import { SearchConfig, searchFilterSelector, searchConfigSelector } from './search-filters';
import { setItemState as d1SetItemState } from '../bungie-api/destiny1-api';
import { setLockState as d2SetLockState } from '../bungie-api/destiny2-api';
import { DestinyAccount } from '../accounts/destiny-account.service';
import { D2StoresService } from '../inventory/d2-stores.service';
import { D1StoresService } from '../inventory/d1-stores.service';
import { DimItem } from '../inventory/item-types';
import { StoreServiceType } from '../inventory/store-types';
import { $rootScope } from 'ngimport';

const bulkItemTags = Array.from(itemTags) as any[];
bulkItemTags.shift();
bulkItemTags.unshift({ label: 'Tags.TagItems' });
bulkItemTags.push({ type: 'clear', label: 'Tags.ClearTag' });
bulkItemTags.push({ type: 'lock', label: 'Tags.LockAll' });
bulkItemTags.push({ type: 'unlock', label: 'Tags.UnlockAll' });

interface StoreProps {
  query: string;
  isPhonePortrait: boolean;
  destinyVersion: 1 | 2;
  account?: DestinyAccount;
  searchConfig: SearchConfig;
  searchFilter(item: DimItem): boolean;
}

const mapDispatchToProps = {
  setSearchQuery
};

type DispatchProps = typeof mapDispatchToProps;

type Props = StoreProps & DispatchProps;

interface State {
  showSelect: boolean;
}

function mapStateToProps(state: RootState): StoreProps {
  return {
    query: querySelector(state),
    isPhonePortrait: state.shell.isPhonePortrait,
    destinyVersion: destinyVersionSelector(state),
    account: currentAccountSelector(state),
    searchConfig: searchConfigSelector(state),
    searchFilter: searchFilterSelector(state)
  };
}

class SearchFilter extends React.Component<Props, State> {
  state: State = { showSelect: false };
  private textcomplete: Textcomplete;
  private inputElement = React.createRef<HTMLInputElement>();
  private $scope = $rootScope.$new(true);

  componentDidMount() {
    this.setupTextcomplete();

    hotkeys
      .bindTo(this.$scope)
      .add({
        combo: ['f'],
        description: t('Hotkey.StartSearch'),
        callback: (event) => {
          this.focusFilterInput();
          event.preventDefault();
          event.stopPropagation();
        }
      })
      .add({
        combo: ['shift+f'],
        description: t('Hotkey.StartSearchClear'),
        callback: (event) => {
          this.clearFilter();
          this.focusFilterInput();
          event.preventDefault();
          event.stopPropagation();
        }
      })
      .add({
        combo: ['esc'],
        allowIn: ['INPUT'],
        callback: () => {
          this.blurFilterInputIfEmpty();
          this.clearFilter();
        }
      });
  }

  componentWillUnmount() {
    if (this.textcomplete) {
      this.textcomplete.destroy();
      this.textcomplete = null;
    }
    this.$scope.$destroy();
  }

  componentWillUpdate(prevProps) {
    if (prevProps.destinyVersion !== this.props.destinyVersion) {
      this.setupTextcomplete();
    }
  }

  render() {
    const { query, isPhonePortrait } = this.props;
    const { showSelect } = this.state;

    const placeholder = isPhonePortrait
      ? t('Header.FilterHelpBrief')
      : t('Header.FilterHelp', { example: 'is:dupe' });

    return (
      <div className="search-filter">
        <input
          ref={this.inputElement}
          className="filter-input"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          placeholder={placeholder}
          type="text"
          name="filter"
          value={query}
          onChange={this.onQueryChange}
        />

        {query.length === 0 ? (
          <span className="filter-help" onClick={this.showFilters} title={t('Header.Filters')}>
            <AppIcon icon={helpIcon} />
          </span>
        ) : (
          <span className="filter-help">
            {showSelect ? (
              <select className="bulk-tag-select" onChange={this.bulkTag}>
                {bulkItemTags.map((tag) => (
                  <option key={tag.type} value={tag.type}>
                    {t(tag.label)}
                  </option>
                ))}
              </select>
            ) : (
              <a onClick={this.onTagClicked}>
                <AppIcon icon={tagIcon} title={t('Header.BulkTag')} />
              </a>
            )}
            <a onClick={this.clearFilter}>
              <AppIcon icon={disabledIcon} title={t('Header.Filters')} />
            </a>
          </span>
        )}
      </div>
    );
  }

  private showFilters = (e) => {
    e.stopPropagation();

    const { destinyVersion } = this.props;

    let result;
    if (result) {
      result.close();
    } else {
      ngDialog.closeAll();
      result = ngDialog.open({
        template: filtersTemplate,
        className: 'filters',
        controllerAs: 'vm',
        appendClassName: 'modal-dialog',
        controller() {
          this.destinyVersion = destinyVersion;
          this.reviewsEnabled = $featureFlags.reviewsEnabled;
        }
      });

      result.closePromise.then(() => {
        result = null;
      });
    }
  };

  private blurFilterInputIfEmpty = () => {
    if (this.props.query === '') {
      this.blurFilterInput();
    }
  };

  private focusFilterInput = () => {
    this.inputElement.current && this.inputElement.current.focus();
  };

  private blurFilterInput = () => {
    this.inputElement.current && this.inputElement.current.blur();
  };

  private onQueryChange: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    // TODO: Debounce?
    const query = e.currentTarget.value;
    this.props.setSearchQuery(query);
  };

  private onTagClicked = () => {
    this.setState({ showSelect: true });
  };

  private clearFilter = () => {
    this.props.setSearchQuery('');
    this.setState({ showSelect: false });
    this.textcomplete.trigger('');
  };

  private getStoresService = (): StoreServiceType => {
    return this.props.destinyVersion === 2 ? D2StoresService : D1StoresService;
  };

  private bulkTag: React.ChangeEventHandler<HTMLSelectElement> = (e) => {
    this.setState({ showSelect: false });

    const selectedTag = e.currentTarget.value;

    const promise = (async () => {
      if (selectedTag === 'lock' || selectedTag === 'unlock') {
        // Bulk locking/unlocking

        const state = selectedTag === 'lock';
        const lockables = this.getStoresService()
          .getAllItems()
          .filter((i) => i.lockable && this.props.searchFilter(i));
        try {
          for (const item of lockables) {
            const store =
              item.owner === 'vault'
                ? item.getStoresService().getActiveStore()!
                : item.getStoresService().getStore(item.owner)!;

            if (item.isDestiny2()) {
              await d2SetLockState(store, item, state);
            } else if (item.isDestiny1()) {
              await d1SetItemState(item, store, state, 'lock');
            }

            // TODO: Gotta do this differently in react land
            item.locked = state;
          }
          toaster.pop(
            'success',
            t(state ? 'Filter.LockAllSuccess' : 'Filter.UnlockAllSuccess', {
              num: lockables.length
            })
          );
        } catch (e) {
          toaster.pop(
            'error',
            t(state ? 'Filter.LockAllFailed' : 'Filter.UnlockAllFailed'),
            e.message
          );
        }
      } else {
        // Bulk tagging
        const itemInfoService = await getItemInfoSource(this.props.account!);
        const tagItems = this.getStoresService()
          .getAllItems()
          .filter((i) => i.taggable && this.props.searchFilter(i));
        await itemInfoService.bulkSave(
          tagItems.map((item) => {
            item.dimInfo.tag = selectedTag === 'clear' ? undefined : (selectedTag as TagValue);
            return item;
          })
        );
      }
    })();

    loadingTracker.addPromise(promise);
  };

  private setupTextcomplete = () => {
    if (!this.inputElement.current) {
      return;
    }

    if (this.textcomplete) {
      this.textcomplete.destroy();
      this.textcomplete = null;
    }
    const editor = new Textarea(this.inputElement.current);
    this.textcomplete = new Textcomplete(editor);
    this.textcomplete.register(
      [
        {
          words: this.props.searchConfig.keywords,
          match: /\b([\w:]{3,})$/i,
          search(term, callback) {
            if (term) {
              let words = this.words.filter((word: string) => word.includes(term.toLowerCase()));
              words = _.sortBy(words, (word: string) => word.indexOf(term.toLowerCase()));
              if (term.match(/\b((is:|not:|tag:|notes:|stat:)\w*)$/i)) {
                callback(words);
              } else if (words.length) {
                callback([term, ...words]);
              } else {
                callback([]);
              }
            }
          },
          // TODO: use "template" to include help text
          index: 1,
          replace(word) {
            word = word.toLowerCase();
            return word.startsWith('is:') && word.startsWith('not:') ? `${word} ` : word;
          }
        }
      ],
      {
        zIndex: 1000
      }
    );

    this.textcomplete.on('rendered', () => {
      if (this.textcomplete.dropdown.items.length) {
        // Activate the first item by default.
        this.textcomplete.dropdown.items[0].activate();
      }
    });
  };
}

export default connect<StoreProps, DispatchProps>(
  mapStateToProps,
  mapDispatchToProps
)(SearchFilter);
