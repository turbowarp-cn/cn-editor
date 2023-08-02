import React from 'react';
import {connect} from 'react-redux';
import {intlShape, injectIntl, defineMessages} from 'react-intl';
import PropTypes from 'prop-types';
import bindAll from 'lodash.bindall';
import {closeAlertWithId, showStandardAlert} from '../reducers/alerts';
import {closeLoadingProject, closeRestorePointModal, openLoadingProject} from '../reducers/modals';
import {LoadingStates, getIsShowingProject, onLoadedProject, requestProjectUpload} from '../reducers/project-state';
import {setFileHandle} from '../reducers/tw';
import TWRestorePointModal from '../components/tw-restore-point-modal/restore-point-modal.jsx';
import RestorePointAPI from '../lib/tw-restore-point-api';
import log from '../lib/log';

/* eslint-disable no-alert */

const AUTOMATIC_INTERVAL = 1000 * 5; // TODO: increase this when testing is done
const MINIMUM_SAVE_TIME = 500;

const messages = defineMessages({
    confirmLoad: {
        defaultMessage: 'Replace existing project?',
        description: 'Confirmation that appears when loading a restore point to confirm overwriting unsaved changes.',
        id: 'tw.restorePoints.confirmLoad'
    },
    confirmDelete: {
        defaultMessage: 'Are you sure you want to delete "{projectTitle}"? This cannot be undone.',
        description: 'Confirmation that appears when deleting a restore poinnt',
        id: 'tw.restorePoints.confirmDelete'
    },
    confirmDeleteAll: {
        defaultMessage: 'Are you sure you want to delete ALL restore points? This cannot be undone.',
        description: 'Confirmation that appears when deleting ALL restore points.',
        id: 'tw.restorePoints.confirmDeleteAll'
    }
});

class TWRestorePointManager extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleClickCreate',
            'handleClickDelete',
            'handleClickDeleteAll',
            'handleClickLoad',
            'handleClickLoadLegacy'
        ]);
        this.state = {
            loading: true,
            restorePoints: [],
            error: null
        };
        this.timeout = null;
    }

    componentWillReceiveProps (nextProps) {
        if (nextProps.isModalVisible && !this.props.isModalVisible) {
            this.refreshState();
        } else if (!nextProps.isModalVisible && this.props.isModalVisible) {
            this.setState({
                restorePoints: []
            });
        }
    }

    componentDidUpdate (prevProps) {
        if (
            this.props.projectChanged !== prevProps.projectChanged ||
            this.props.isShowingProject !== prevProps.isShowingProject
        ) {
            if (this.props.projectChanged && this.props.isShowingProject) {
                // Project was modified
                if (!this.timeout) {
                    this.queueRestorePoint();
                }
            } else {
                // Project was saved
                clearTimeout(this.timeout);
                this.timeout = null;
            }
        }
    }

    componentWillUnmount () {
        clearTimeout(this.timeout);
    }

    handleClickCreate () {
        this.createRestorePoint(RestorePointAPI.TYPE_MANUAL)
            .catch(error => {
                this.handleModalError(error);
            });
    }

    handleClickDelete (id) {
        const projectTitle = this.state.restorePoints.find(i => i.id === id).title;
        if (!confirm(this.props.intl.formatMessage(messages.confirmDelete, {projectTitle}))) {
            return;
        }

        this.setState({
            loading: true
        });
        RestorePointAPI.deleteRestorePoint(id)
            .then(() => {
                this.refreshState();
            })
            .catch(error => {
                this.handleModalError(error);
            });
    }

    handleClickDeleteAll () {
        if (!confirm(this.props.intl.formatMessage(messages.confirmDeleteAll))) {
            return;
        }

        this.setState({
            loading: true
        });
        RestorePointAPI.deleteAllRestorePoints()
            .then(() => {
                this.refreshState();
            })
            .catch(error => {
                this.handleModalError(error);
            });
    }

    _startLoading () {
        this.props.onCloseModal();
        this.props.onStartLoadingRestorePoint(this.props.loadingState);
    }

    _finishLoading (success) {
        this.props.onFinishLoadingRestorePoint(success, this.props.loadingState);
    }

    handleClickLoad (id) {
        if (this.props.projectChanged && !confirm(this.props.intl.formatMessage(messages.confirmLoad))) {
            return;
        }
        this._startLoading();
        RestorePointAPI.loadRestorePoint(id)
            .then(buffer => this.props.vm.loadProject(buffer))
            .then(() => {
                this._finishLoading(true);
            })
            .catch(error => {
                this.handleModalError(error);
                this._finishLoading(false);
            });
    }

    handleClickLoadLegacy () {
        if (this.props.projectChanged && !confirm(this.props.intl.formatMessage(messages.confirmLoad))) {
            return;
        }
        this._startLoading();
        RestorePointAPI.loadLegacyRestorePoint()
            .then(buffer => this.props.vm.loadProject(buffer))
            .then(() => {
                this._finishLoading(true);
            })
            .catch(error => {
                // Don't handleError on this because we're expecting error 90% of the time
                alert(error);
                this._finishLoading(false);
            });
    }

    queueRestorePoint () {
        this.timeout = setTimeout(() => {
            this.createRestorePoint(RestorePointAPI.TYPE_AUTOMATIC).then(() => {
                this.timeout = null;

                if (this.props.projectChanged && this.props.isShowingProject) {
                    // Project is still not saved
                    this.queueRestorePoint();
                }
            });
        }, AUTOMATIC_INTERVAL);
    }

    createRestorePoint (type) {
        if (this.props.isModalVisible) {
            this.setState({
                loading: true
            });
        }

        this.props.onStartCreatingRestorePoint();
        return Promise.all([
            RestorePointAPI.createRestorePoint(this.props.vm, this.props.projectTitle, type)
                .then(() => RestorePointAPI.removeExtraneousRestorePoints()),

            // Force saves to not be instant so people can see that we're making a restore point
            // It also makes refreshes less likely to cause accidental clicks in the modal
            new Promise(resolve => setTimeout(resolve, MINIMUM_SAVE_TIME))
        ])
            .then(() => {
                if (this.props.isModalVisible) {
                    this.refreshState();
                }

                this.props.onFinishCreatingRestorePoint();
            });
    }

    refreshState () {
        this.setState({
            loading: true,
            error: null,
            restorePoints: []
        });
        RestorePointAPI.getAllRestorePoints()
            .then(restorePoints => {
                this.setState({
                    loading: false,
                    restorePoints
                });
            })
            .catch(error => {
                this.handleModalError(error);
            });
    }

    handleModalError (error) {
        log.error('Restore point error', error);
        this.setState({
            error: `${error}`
        });
    }

    render () {
        if (this.props.isModalVisible) {
            return (
                <TWRestorePointModal
                    onClose={this.props.onCloseModal}
                    onClickCreate={this.handleClickCreate}
                    onClickDelete={this.handleClickDelete}
                    onClickDeleteAll={this.handleClickDeleteAll}
                    onClickLoad={this.handleClickLoad}
                    onClickLoadLegacy={this.handleClickLoadLegacy}
                    isLoading={this.state.loading}
                    restorePoints={this.state.restorePoints}
                    error={this.state.error}
                />
            );
        }
        return null;
    }
}

TWRestorePointManager.propTypes = {
    intl: intlShape,
    projectChanged: PropTypes.bool.isRequired,
    projectTitle: PropTypes.string.isRequired,
    onStartCreatingRestorePoint: PropTypes.func.isRequired,
    onFinishCreatingRestorePoint: PropTypes.func.isRequired,
    onStartLoadingRestorePoint: PropTypes.func.isRequired,
    onFinishLoadingRestorePoint: PropTypes.func.isRequired,
    onCloseModal: PropTypes.func.isRequired,
    loadingState: PropTypes.oneOf(LoadingStates).isRequired,
    isShowingProject: PropTypes.bool.isRequired,
    isModalVisible: PropTypes.bool.isRequired,
    vm: PropTypes.shape({
        loadProject: PropTypes.func.isRequired
    }).isRequired
};

const mapStateToProps = state => ({
    projectChanged: state.scratchGui.projectChanged,
    projectTitle: state.scratchGui.projectTitle,
    loadingState: state.scratchGui.projectState.loadingState,
    isShowingProject: getIsShowingProject(state.scratchGui.projectState.loadingState),
    isModalVisible: state.scratchGui.modals.restorePointModal,
    vm: state.scratchGui.vm
});

const mapDispatchToProps = dispatch => ({
    onStartCreatingRestorePoint: () => dispatch(showStandardAlert('twCreatingRestorePoint')),
    onFinishCreatingRestorePoint: () => dispatch(closeAlertWithId('twCreatingRestorePoint')),
    onStartLoadingRestorePoint: loadingState => {
        dispatch(openLoadingProject());
        dispatch(requestProjectUpload(loadingState));
    },
    onFinishLoadingRestorePoint: (success, loadingState) => {
        dispatch(onLoadedProject(loadingState, false, success));
        dispatch(closeLoadingProject());
        dispatch(setFileHandle(null));
    },
    onCloseModal: () => dispatch(closeRestorePointModal())
});

export default injectIntl(connect(
    mapStateToProps,
    mapDispatchToProps
)(TWRestorePointManager));
