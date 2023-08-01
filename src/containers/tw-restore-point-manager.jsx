import React from 'react';
import {connect} from 'react-redux';
import PropTypes from 'prop-types';
import bindAll from 'lodash.bindall';
import {closeAlertWithId, showStandardAlert} from '../reducers/alerts';
import {closeLoadingProject, closeRestorePointModal, openLoadingProject} from '../reducers/modals';
import {LoadingStates, getIsShowingProject, onLoadedProject, requestProjectUpload} from '../reducers/project-state';
import {setFileHandle} from '../reducers/tw';
import TWRestorePointModal from '../components/tw-restore-point-modal/restore-point-modal.jsx';
import RestorePointAPI from '../lib/tw-restore-point-api';
import log from '../lib/log';

const AUTOMATIC_INTERVAL = 1000 * 5;

class TWRestorePointManager extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleClickCreate',
            'handleClickDelete',
            'handleClickDeleteAll',
            'handleClickLoad'
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
        }
    }

    componentDidUpdate (prevProps) {
        if (
            RestorePointAPI.isSupported && (
                this.props.projectChanged !== prevProps.projectChanged ||
                this.props.isShowingProject !== prevProps.isShowingProject
            )
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
        this.createRestorePoint();
    }

    handleClickDelete (id) {
        this.setState({
            loading: true
        });
        RestorePointAPI.deleteRestorePoint(id)
            .then(() => {
                this.refreshState();
            })
            .catch(error => {
                this.handleError(error);
            });
    }

    handleClickDeleteAll () {
        this.setState({
            loading: true
        });
        RestorePointAPI.deleteAllRestorePoints()
            .then(() => {
                this.refreshState();
            })
            .catch(error => {
                this.handleError(error);
            });
    }

    handleClickLoad (id) {
        this.props.onCloseModal();
        this.props.onStartLoadingRestorePoint(this.props.loadingState);
        RestorePointAPI.loadRestorePoint(id)
            .then(buffer => this.props.vm.loadProject(buffer))
            .then(() => {
                this.props.onFinishLoadingRestorePoint(true, this.props.loadingState);
            })
            .catch(error => {
                this.handleError(error);
                this.props.onFinishLoadingRestorePoint(false, this.props.loadingState);
            });
    }

    queueRestorePoint () {
        this.timeout = setTimeout(() => {
            this.createRestorePoint().then(() => {
                this.timeout = null;

                if (this.props.projectChanged && this.props.isShowingProject) {
                    // Project is still not saved
                    this.queueRestorePoint();
                }
            });
        }, AUTOMATIC_INTERVAL);
    }

    createRestorePoint () {
        if (this.props.isModalVisible) {
            this.setState({
                loading: true
            });
        }

        this.props.onStartCreatingRestorePoint();
        return RestorePointAPI.createRestorePoint(this.props.vm, this.props.projectTitle)
            .then(() => {
                if (this.props.isModalVisible) {
                    this.refreshState();
                }

                this.props.onFinishCreatingRestorePoint();
            })
            .catch(error => {
                this.handleError(error);
            });
    }

    refreshState () {
        if (this.state.error) {
            return;
        }
        this.setState({
            loading: true,
            restorePoints: []
        });
        RestorePointAPI.readManifest()
            .then(manifest => {
                this.setState({
                    loading: false,
                    restorePoints: manifest.restorePoints
                });
            })
            .catch(error => {
                this.handleError(error);
            });
    }

    handleError (error) {
        log.error('restore point error', error);
        this.setState({
            error: `${error}`
        });
        clearTimeout(this.timeout);

        if (!this.props.isModalVisible) {
            // TODO
            // eslint-disable-next-line no-alert
            alert(`${error}`);
        }
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
                    isSupported={RestorePointAPI.isSupported}
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

export default connect(
    mapStateToProps,
    mapDispatchToProps
)(TWRestorePointManager);
