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
        this.setState({
            loading: true
        });
        this.createRestorePoint().then(() => {
            this.refreshState();
        });
    }

    handleClickDelete (id) {
        this.setState({
            loading: true
        });
        RestorePointAPI.deleteRestorePoint(id).then(() => {
            this.refreshState();
        });
    }

    handleClickDeleteAll () {
        this.setState({
            loading: true
        });
        RestorePointAPI.deleteAllRestorePoints().then(() => {
            this.refreshState();
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
                // eslint-disable-next-line no-alert
                alert(error);

                this.props.onFinishLoadingRestorePoint(false, this.props.loadingState);
            });
    }

    queueRestorePoint () {
        this.timeout = setTimeout(() => {
            this.createRestorePoint().then(() => {
                this.timeout = null;

                if (this.props.projectChanged && this.props.isShowingProject) {
                    // Still not saved
                    this.queueRestorePoint();
                }
            });
        }, AUTOMATIC_INTERVAL);
    }

    createRestorePoint () {
        this.props.onStartCreatingRestorePoint();
        return RestorePointAPI.createRestorePoint(this.props.vm, this.props.projectTitle)
            .then(() => {
                this.props.onFinishCreatingRestorePoint();
            });
    }

    refreshState () {
        this.setState({
            loading: true,
            restorePoints: [],
            error: null
        });
        RestorePointAPI.readManifest()
            .then(manifest => {
                this.setState({
                    loading: false,
                    restorePoints: manifest.restorePoints
                });
            })
            .catch(error => {
                this.setState({
                    loading: false,
                    error
                });
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
